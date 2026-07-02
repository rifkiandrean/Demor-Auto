import { TripRecord, ServiceRecord, VehicleInfo } from '../types';

// Standard local storage keys
const STORAGE_KEYS = {
  BIOMETRIC: 'mobil_tracker_biometric_reg',
  ACCESS_TOKEN: 'google_sheets_access_token'
};

// Local storage helpers for token and preferences
const getLocalData = <T>(key: string, defaultValue: T): T => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    console.warn('Error reading localStorage', e);
    return defaultValue;
  }
};

const setLocalData = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Error writing localStorage', e);
  }
};

function parseRows<T>(headers: string[], rows: any[][]): T[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((header, index) => {
      let val = row[index];
      if (val === undefined || val === null) {
        val = '';
      } else {
        const valStr = String(val).trim();
        if (valStr === 'true') {
          val = true;
        } else if (valStr === 'false') {
          val = false;
        } else if (!isNaN(Number(valStr)) && valStr !== '') {
          val = Number(valStr);
        } else {
          val = valStr;
        }
      }
      obj[header] = val;
    });
    return obj as T;
  });
}

export class DbService {
  private userId: string | null = null;
  private onSyncCallback: (() => void) | null = null;
  private accessToken: string | null = null;
  private cachedSpreadsheetId: string | null = null;

  constructor(userId: string | null) {
    this.userId = userId;
    try {
      this.accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    } catch (e) {
      console.warn('Error reading access token from localStorage', e);
    }
  }

  setUserId(userId: string | null) {
    this.userId = userId;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      }
    } catch (e) {
      console.warn('Error writing access token to localStorage', e);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setOnSync(callback: () => void) {
    this.onSyncCallback = callback;
  }

  // Helper to trigger callback
  private triggerSyncChange() {
    if (this.onSyncCallback) {
      this.onSyncCallback();
    }
  }

  // Online Check
  isOnline(): boolean {
    return navigator.onLine;
  }

  async getSpreadsheetId(createIfMissing = false): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }

    if (this.cachedSpreadsheetId) {
      return this.cachedSpreadsheetId;
    }

    const storageKey = `demor_auto_spreadsheet_id_${this.userId || 'guest'}`;
    const localId = localStorage.getItem(storageKey);
    if (localId) {
      this.cachedSpreadsheetId = localId;
      return localId;
    }

    try {
      // Search Google Drive for Demor_Auto_Database
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='Demor_Auto_Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const res = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          this.setAccessToken(null);
        }
        throw new Error(`Failed to search Google Drive: ${res.statusText}`);
      }
      
      const searchResult = await res.json();
      const files = searchResult.files || [];
      
      if (files.length > 0) {
        const spreadsheetId = files[0].id;
        localStorage.setItem(storageKey, spreadsheetId);
        this.cachedSpreadsheetId = spreadsheetId;
        return spreadsheetId;
      }
      
      if (!createIfMissing) {
        throw new Error('SPREADSHEET_NOT_FOUND');
      }
      
      // If not found, create a new spreadsheet with 3 sheets (Vehicle, Trips, Services)
      const createUrl = `https://sheets.googleapis.com/v4/spreadsheets`;
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: 'Demor_Auto_Database'
          },
          sheets: [
            { properties: { title: 'Vehicle' } },
            { properties: { title: 'Trips' } },
            { properties: { title: 'Services' } }
          ]
        })
      });
      
      if (!createRes.ok) {
        throw new Error(`Failed to create Google Sheet: ${createRes.statusText}`);
      }
      
      const newSheet = await createRes.json();
      const spreadsheetId = newSheet.spreadsheetId;
      
      localStorage.setItem(storageKey, spreadsheetId);
      this.cachedSpreadsheetId = spreadsheetId;
      
      // Initialize headers for each sheet
      const initHeadersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
      const headersRes = await fetch(initHeadersUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: 'Vehicle!A1:H1',
              values: [["id", "brand", "model", "licensePlate", "currentOdometer", "fuelType", "oilInterval", "serviceInterval"]]
            },
            {
              range: 'Trips!A1:J1',
              values: [["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"]]
            },
            {
              range: 'Services!A1:J1',
              values: [["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"]]
            }
          ]
        })
      });

      if (!headersRes.ok) {
        console.warn('Failed to initialize Google Sheets headers, will proceed');
      }
      
      return spreadsheetId;
    } catch (e) {
      console.warn('Error finding or creating Demor Auto Database Spreadsheet', e);
      throw e;
    }
  }

  private async readSheetRows(sheetName: string, headers: string[]): Promise<any[]> {
    if (!this.accessToken) {
      return [];
    }
    try {
      const spreadsheetId = await this.getSpreadsheetId();
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A2:Z1000`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          this.setAccessToken(null); // force clear stale token
        }
        if (res.status === 404) {
          const storageKey = `demor_auto_spreadsheet_id_${this.userId || 'guest'}`;
          localStorage.removeItem(storageKey);
          this.cachedSpreadsheetId = null;
          throw new Error('SPREADSHEET_NOT_FOUND');
        }
        throw new Error(`Sheets API read error: ${res.statusText}`);
      }
      const data = await res.json();
      const rows = data.values || [];
      return parseRows(headers, rows);
    } catch (e: any) {
      if (e.message === 'SPREADSHEET_NOT_FOUND') {
        throw e;
      }
      console.warn(`Error reading from Google Sheet ${sheetName}`, e);
      throw e;
    }
  }

  private async writeSheetRows(sheetName: string, headers: string[], items: any[]): Promise<void> {
    if (!this.accessToken) {
      return;
    }
    try {
      const spreadsheetId = await this.getSpreadsheetId();
      
      // 1. Clear existing rows first (A2 to Z1000)
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A2:Z1000:clear`;
      const clearRes = await fetch(clearUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (!clearRes.ok) {
        if (clearRes.status === 401) {
          this.setAccessToken(null);
          return;
        }
        if (clearRes.status === 404) {
          const storageKey = `demor_auto_spreadsheet_id_${this.userId || 'guest'}`;
          localStorage.removeItem(storageKey);
          this.cachedSpreadsheetId = null;
          throw new Error('SPREADSHEET_NOT_FOUND');
        }
        throw new Error(`Sheets API clear error: ${clearRes.statusText}`);
      }

      // 2. Map objects to array of values in correct order of headers
      const values = items.map(item => {
        return headers.map(header => {
          const val = item[header];
          return val === undefined || val === null ? '' : val;
        });
      });

      if (values.length === 0) return;

      // 3. Update the sheet with new values
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A2?valueInputOption=USER_ENTERED`;
      const res = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });
      if (!res.ok) {
        if (res.status === 401) {
          this.setAccessToken(null);
        }
        if (res.status === 404) {
          const storageKey = `demor_auto_spreadsheet_id_${this.userId || 'guest'}`;
          localStorage.removeItem(storageKey);
          this.cachedSpreadsheetId = null;
          throw new Error('SPREADSHEET_NOT_FOUND');
        }
        throw new Error(`Sheets API update error: ${res.statusText}`);
      }
    } catch (e: any) {
      if (e.message === 'SPREADSHEET_NOT_FOUND') {
        throw e;
      }
      console.warn(`Error writing to Google Sheet ${sheetName}`, e);
      throw e;
    }
  }

  // VEHICLE OPERATIONS
  async getVehicle(): Promise<VehicleInfo | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const headers = ["id", "brand", "model", "licensePlate", "currentOdometer", "fuelType", "oilInterval", "serviceInterval"];
      const vehicles = await this.readSheetRows('Vehicle', headers);
      if (vehicles.length > 0) {
        return vehicles[0] as VehicleInfo;
      }
    } catch (e: any) {
      if (e.message === 'SPREADSHEET_NOT_FOUND') {
        throw e;
      }
      console.warn('Google Sheets error fetching vehicle', e);
      throw e;
    }
    return null;
  }

  async saveVehicle(vehicle: VehicleInfo): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }
    const headers = ["id", "brand", "model", "licensePlate", "currentOdometer", "fuelType", "oilInterval", "serviceInterval"];
    await this.writeSheetRows('Vehicle', headers, [vehicle]);
    this.triggerSyncChange();
  }

  // TRIPS OPERATIONS
  async getTrips(): Promise<TripRecord[]> {
    if (!this.accessToken) {
      return [];
    }

    try {
      const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
      const trips = await this.readSheetRows('Trips', headers);
      
      // Filter out any template/mock trips
      const filteredTrips = trips.filter(trip => {
        const isMockDate = trip.date === '2026-06-25' || trip.date === '25 Jun 2026' ||
                           trip.date === '2026-06-12' || trip.date === '12 Jun 2026' ||
                           trip.date === '2026-05-30' || trip.date === '30 Mei 2026' ||
                           String(trip.date).includes('25 Jun') || 
                           String(trip.date).includes('12 Jun') || 
                           String(trip.date).includes('30 Mei');
        
        const isMockRoute = (trip.origin && trip.origin.includes('Jakarta') && trip.destination && trip.destination.includes('Bandung')) ||
                            (trip.origin && trip.origin.includes('Bandung') && trip.destination && trip.destination.includes('Jakarta')) ||
                            (trip.origin && trip.origin.includes('Surabaya') && trip.destination && trip.destination.includes('Malang'));

        const isMockNotes = trip.notes && (
          trip.notes.includes('Liburan') || 
          trip.notes.includes('akhir pekan') || 
          trip.notes.includes('keluarga') ||
          trip.notes.includes('Perjalanan pulang') ||
          trip.notes.includes('arus lalu lintas lancar') ||
          trip.notes.includes('Kunjungan kerja') ||
          trip.notes.includes('ke Malang')
        );

        const isMockId = String(trip.id).startsWith('mock');
        
        return !(isMockDate || isMockRoute || isMockNotes || isMockId);
      });
      
      // If we filtered out some mock trips, update the Google Sheet to permanently delete them
      if (filteredTrips.length < trips.length) {
        await this.writeSheetRows('Trips', headers, filteredTrips);
      }

      return filteredTrips.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (e: any) {
      if (e.message === 'SPREADSHEET_NOT_FOUND') {
        throw e;
      }
      console.warn('Google Sheets error fetching trips', e);
      throw e;
    }
  }

  async addTrip(trip: Omit<TripRecord, 'id' | 'createdAt'>): Promise<TripRecord> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }
    const newTrip: TripRecord = {
      ...trip,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      createdAt: new Date().toISOString()
    };

    const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
    const currentSheetTrips = await this.readSheetRows('Trips', headers);
    const updatedSheetTrips = [newTrip, ...currentSheetTrips];
    await this.writeSheetRows('Trips', headers, updatedSheetTrips);
    this.triggerSyncChange();
    return newTrip;
  }

  async deleteTrip(id: string): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }
    const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
    const currentSheetTrips = await this.readSheetRows('Trips', headers);
    const updatedSheetTrips = currentSheetTrips.filter(t => t.id !== id);
    await this.writeSheetRows('Trips', headers, updatedSheetTrips);
    this.triggerSyncChange();
  }

  // SERVICES OPERATIONS
  async getServices(): Promise<ServiceRecord[]> {
    if (!this.accessToken) {
      return [];
    }

    try {
      const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
      const services = await this.readSheetRows('Services', headers);
      
      // Filter out any template/mock services
      const filteredServices = services.filter(service => {
        const isMockId = String(service.id).startsWith('mock') || String(service.id) === 's1' || String(service.id) === 's2';
        const isMockNotes = service.notes && (
          service.notes.includes('mock') || 
          service.notes.includes('contoh') || 
          service.notes.includes('template') || 
          service.notes.includes('Dummy')
        );
        return !(isMockId || isMockNotes);
      });

      // If we filtered out some mock services, update Google Sheets to permanently delete them
      if (filteredServices.length < services.length) {
        await this.writeSheetRows('Services', headers, filteredServices);
      }

      return filteredServices.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (e: any) {
      if (e.message === 'SPREADSHEET_NOT_FOUND') {
        throw e;
      }
      console.warn('Google Sheets error fetching services', e);
      throw e;
    }
  }

  async addService(service: Omit<ServiceRecord, 'id' | 'createdAt'>): Promise<ServiceRecord> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }
    const newService: ServiceRecord = {
      ...service,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      createdAt: new Date().toISOString()
    };

    const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
    const currentSheetServices = await this.readSheetRows('Services', headers);
    const updatedSheetServices = [newService, ...currentSheetServices];
    await this.writeSheetRows('Services', headers, updatedSheetServices);
    this.triggerSyncChange();
    return newService;
  }

  async updateService(service: ServiceRecord): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }
    const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
    const currentSheetServices = await this.readSheetRows('Services', headers);
    const updatedSheetServices = currentSheetServices.map(s => s.id === service.id ? service : s);
    await this.writeSheetRows('Services', headers, updatedSheetServices);
    this.triggerSyncChange();
  }

  async deleteService(id: string): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Google OAuth access token is missing. Please sign in with Google.');
    }
    const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
    const currentSheetServices = await this.readSheetRows('Services', headers);
    const updatedSheetServices = currentSheetServices.filter(s => s.id !== id);
    await this.writeSheetRows('Services', headers, updatedSheetServices);
    this.triggerSyncChange();
  }

  // SYNC OFFLINE DRAFTS TO GOOGLE SHEETS
  async syncLocalToSheets(): Promise<void> {
    // 100% online real-time. No local storage caching or synchronization is needed.
    this.triggerSyncChange();
  }

  async syncLocalToFirebase(): Promise<void> {
    await this.syncLocalToSheets();
  }

  disconnect(): void {
    this.setAccessToken(null);
    this.cachedSpreadsheetId = null;
    const storageKey = `demor_auto_spreadsheet_id_${this.userId || 'guest'}`;
    localStorage.removeItem(storageKey);
  }

  // Biometric local status
  getBiometricRegistration(email: string): boolean {
    const registeredEmails = getLocalData<string[]>(STORAGE_KEYS.BIOMETRIC, []);
    return registeredEmails.includes(email);
  }

  registerBiometric(email: string): void {
    const registeredEmails = getLocalData<string[]>(STORAGE_KEYS.BIOMETRIC, []);
    if (!registeredEmails.includes(email)) {
      registeredEmails.push(email);
      setLocalData(STORAGE_KEYS.BIOMETRIC, registeredEmails);
    }
  }
}
