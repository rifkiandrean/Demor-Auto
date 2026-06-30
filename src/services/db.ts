import { TripRecord, ServiceRecord, VehicleInfo } from '../types';

// Standard local storage keys for offline fallback
const STORAGE_KEYS = {
  TRIPS: 'mobil_tracker_trips',
  SERVICES: 'mobil_tracker_services',
  VEHICLE: 'mobil_tracker_vehicle',
  BIOMETRIC: 'mobil_tracker_biometric_reg',
  ACCESS_TOKEN: 'google_sheets_access_token'
};

// Local storage helpers
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
      return getLocalData<VehicleInfo | null>(STORAGE_KEYS.VEHICLE, null);
    }

    try {
      const headers = ["id", "brand", "model", "licensePlate", "currentOdometer", "fuelType", "oilInterval", "serviceInterval"];
      const vehicles = await this.readSheetRows('Vehicle', headers);
      if (vehicles.length > 0) {
        const data = vehicles[0] as VehicleInfo;
        setLocalData(STORAGE_KEYS.VEHICLE, data);
        return data;
      }
    } catch (e) {
      console.warn('Google Sheets error fetching vehicle, falling back to local', e);
    }
    return getLocalData<VehicleInfo | null>(STORAGE_KEYS.VEHICLE, null);
  }

  async saveVehicle(vehicle: VehicleInfo): Promise<void> {
    setLocalData(STORAGE_KEYS.VEHICLE, vehicle);
    this.triggerSyncChange();

    if (this.accessToken) {
      try {
        const headers = ["id", "brand", "model", "licensePlate", "currentOdometer", "fuelType", "oilInterval", "serviceInterval"];
        await this.writeSheetRows('Vehicle', headers, [vehicle]);
      } catch (e) {
        console.warn('Error saving vehicle to Google Sheets', e);
      }
    }
  }

  // TRIPS OPERATIONS
  async getTrips(): Promise<TripRecord[]> {
    if (!this.accessToken) {
      return getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    try {
      const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
      const trips = await this.readSheetRows('Trips', headers);
      setLocalData(STORAGE_KEYS.TRIPS, trips);
      return trips.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (e) {
      console.warn('Google Sheets error fetching trips, falling back to local', e);
    }
    return getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async addTrip(trip: Omit<TripRecord, 'id' | 'createdAt'>): Promise<TripRecord> {
    const newTrip: TripRecord = {
      ...trip,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      createdAt: new Date().toISOString()
    };

    const currentTrips = getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    const updatedTrips = [newTrip, ...currentTrips].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    setLocalData(STORAGE_KEYS.TRIPS, updatedTrips);
    this.triggerSyncChange();

    if (this.accessToken) {
      try {
        const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
        const currentSheetTrips = await this.readSheetRows('Trips', headers);
        const updatedSheetTrips = [newTrip, ...currentSheetTrips];
        await this.writeSheetRows('Trips', headers, updatedSheetTrips);
      } catch (e) {
        console.warn('Error writing trip to Google Sheets', e);
      }
    }
    return newTrip;
  }

  async deleteTrip(id: string): Promise<void> {
    const currentTrips = getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    const updatedTrips = currentTrips.filter(t => t.id !== id);
    setLocalData(STORAGE_KEYS.TRIPS, updatedTrips);
    this.triggerSyncChange();

    if (this.accessToken) {
      try {
        const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
        const currentSheetTrips = await this.readSheetRows('Trips', headers);
        const updatedSheetTrips = currentSheetTrips.filter(t => t.id !== id);
        await this.writeSheetRows('Trips', headers, updatedSheetTrips);
      } catch (e) {
        console.warn('Error deleting trip from Google Sheets', e);
      }
    }
  }

  // SERVICES OPERATIONS
  async getServices(): Promise<ServiceRecord[]> {
    if (!this.accessToken) {
      return getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    try {
      const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
      const services = await this.readSheetRows('Services', headers);
      setLocalData(STORAGE_KEYS.SERVICES, services);
      return services.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (e) {
      console.warn('Google Sheets error fetching services, falling back to local', e);
    }
    return getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async addService(service: Omit<ServiceRecord, 'id' | 'createdAt'>): Promise<ServiceRecord> {
    const newService: ServiceRecord = {
      ...service,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      createdAt: new Date().toISOString()
    };

    const currentServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    const updatedServices = [newService, ...currentServices].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    setLocalData(STORAGE_KEYS.SERVICES, updatedServices);
    this.triggerSyncChange();

    if (this.accessToken) {
      try {
        const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
        const currentSheetServices = await this.readSheetRows('Services', headers);
        const updatedSheetServices = [newService, ...currentSheetServices];
        await this.writeSheetRows('Services', headers, updatedSheetServices);
      } catch (e) {
        console.warn('Error writing service to Google Sheets', e);
      }
    }
    return newService;
  }

  async updateService(service: ServiceRecord): Promise<void> {
    const currentServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    const updatedServices = currentServices.map(s => s.id === service.id ? service : s);
    setLocalData(STORAGE_KEYS.SERVICES, updatedServices);
    this.triggerSyncChange();

    if (this.accessToken) {
      try {
        const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
        const currentSheetServices = await this.readSheetRows('Services', headers);
        const updatedSheetServices = currentSheetServices.map(s => s.id === service.id ? service : s);
        await this.writeSheetRows('Services', headers, updatedSheetServices);
      } catch (e) {
        console.warn('Error updating service on Google Sheets', e);
      }
    }
  }

  async deleteService(id: string): Promise<void> {
    const currentServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    const updatedServices = currentServices.filter(s => s.id !== id);
    setLocalData(STORAGE_KEYS.SERVICES, updatedServices);
    this.triggerSyncChange();

    if (this.accessToken) {
      try {
        const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
        const currentSheetServices = await this.readSheetRows('Services', headers);
        const updatedSheetServices = currentSheetServices.filter(s => s.id !== id);
        await this.writeSheetRows('Services', headers, updatedSheetServices);
      } catch (e) {
        console.warn('Error deleting service from Google Sheets', e);
      }
    }
  }

  // SYNC OFFLINE DRAFTS TO GOOGLE SHEETS
  async syncLocalToSheets(): Promise<void> {
    if (!this.accessToken) return;

    // 1. Sync vehicle
    const localVehicle = getLocalData<VehicleInfo | null>(STORAGE_KEYS.VEHICLE, null);
    if (localVehicle) {
      try {
        const headers = ["id", "brand", "model", "licensePlate", "currentOdometer", "fuelType", "oilInterval", "serviceInterval"];
        await this.writeSheetRows('Vehicle', headers, [localVehicle]);
      } catch (e) {
        console.warn('Sync vehicle error', e);
      }
    }

    // 2. Sync trips
    const localTrips = getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    if (localTrips.length > 0) {
      try {
        const headers = ["id", "date", "origin", "destination", "distance", "duration", "fuelCost", "fuelLiters", "notes", "createdAt"];
        const currentSheetTrips = await this.readSheetRows('Trips', headers);
        const existingIds = new Set(currentSheetTrips.map(t => t.id));
        const mergedTrips = [...currentSheetTrips];
        
        for (const trip of localTrips) {
          if (!existingIds.has(trip.id)) {
            mergedTrips.push(trip);
          }
        }
        await this.writeSheetRows('Trips', headers, mergedTrips);
      } catch (e) {
        console.warn('Sync trips error', e);
      }
    }

    // 3. Sync services
    const localServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    if (localServices.length > 0) {
      try {
        const headers = ["id", "date", "serviceType", "cost", "currentOdometer", "nextServiceOdometer", "nextServiceDate", "notes", "status", "createdAt"];
        const currentSheetServices = await this.readSheetRows('Services', headers);
        const existingIds = new Set(currentSheetServices.map(s => s.id));
        const mergedServices = [...currentSheetServices];

        for (const service of localServices) {
          if (!existingIds.has(service.id)) {
            mergedServices.push(service);
          }
        }
        await this.writeSheetRows('Services', headers, mergedServices);
      } catch (e) {
        console.warn('Sync services error', e);
      }
    }

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
