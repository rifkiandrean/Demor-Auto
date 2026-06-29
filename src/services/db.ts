import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { TripRecord, ServiceRecord, VehicleInfo } from '../types';

// Standard local storage keys for offline fallback
const STORAGE_KEYS = {
  TRIPS: 'mobil_tracker_trips',
  SERVICES: 'mobil_tracker_services',
  VEHICLE: 'mobil_tracker_vehicle',
  BIOMETRIC: 'mobil_tracker_biometric_reg'
};

// Local storage helpers
const getLocalData = <T>(key: string, defaultValue: T): T => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    console.error('Error reading localStorage', e);
    return defaultValue;
  }
};

const setLocalData = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Error writing localStorage', e);
  }
};

export class DbService {
  private userId: string | null = null;
  private onSyncCallback: (() => void) | null = null;

  constructor(userId: string | null) {
    this.userId = userId;
  }

  setUserId(userId: string | null) {
    const prevId = this.userId;
    this.userId = userId;
    if (userId && prevId !== userId) {
      this.syncLocalToFirebase();
    }
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

  // VEHICLE OPERATIONS
  async getVehicle(): Promise<VehicleInfo | null> {
    if (!this.userId) {
      return getLocalData<VehicleInfo | null>(STORAGE_KEYS.VEHICLE, null);
    }

    try {
      const docRef = doc(db, 'users', this.userId, 'vehicle', 'info');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as VehicleInfo;
        setLocalData(STORAGE_KEYS.VEHICLE, data);
        return data;
      }
    } catch (e) {
      console.warn('Firebase error fetching vehicle, falling back to local', e);
    }
    return getLocalData<VehicleInfo | null>(STORAGE_KEYS.VEHICLE, null);
  }

  async saveVehicle(vehicle: VehicleInfo): Promise<void> {
    setLocalData(STORAGE_KEYS.VEHICLE, vehicle);
    this.triggerSyncChange();

    if (this.userId) {
      try {
        const docRef = doc(db, 'users', this.userId, 'vehicle', 'info');
        await setDoc(docRef, vehicle);
      } catch (e) {
        console.error('Error saving vehicle to Firebase', e);
      }
    }
  }

  // TRIPS OPERATIONS
  async getTrips(): Promise<TripRecord[]> {
    if (!this.userId) {
      return getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    try {
      const q = query(
        collection(db, 'users', this.userId, 'trips'),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const trips: TripRecord[] = [];
      querySnapshot.forEach((doc) => {
        trips.push({ id: doc.id, ...doc.data() } as TripRecord);
      });
      
      setLocalData(STORAGE_KEYS.TRIPS, trips);
      return trips;
    } catch (e) {
      console.warn('Firebase error fetching trips, falling back to local', e);
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

    if (this.userId) {
      try {
        const docRef = doc(db, 'users', this.userId, 'trips', newTrip.id);
        await setDoc(docRef, newTrip);
      } catch (e) {
        console.error('Error writing trip to Firebase', e);
      }
    }
    return newTrip;
  }

  async deleteTrip(id: string): Promise<void> {
    const currentTrips = getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    const updatedTrips = currentTrips.filter(t => t.id !== id);
    setLocalData(STORAGE_KEYS.TRIPS, updatedTrips);
    this.triggerSyncChange();

    if (this.userId) {
      try {
        const docRef = doc(db, 'users', this.userId, 'trips', id);
        await deleteDoc(docRef);
      } catch (e) {
        console.error('Error deleting trip from Firebase', e);
      }
    }
  }

  // SERVICES OPERATIONS
  async getServices(): Promise<ServiceRecord[]> {
    if (!this.userId) {
      return getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    try {
      const q = query(
        collection(db, 'users', this.userId, 'services'),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const services: ServiceRecord[] = [];
      querySnapshot.forEach((doc) => {
        services.push({ id: doc.id, ...doc.data() } as ServiceRecord);
      });
      
      setLocalData(STORAGE_KEYS.SERVICES, services);
      return services;
    } catch (e) {
      console.warn('Firebase error fetching services, falling back to local', e);
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

    if (this.userId) {
      try {
        const docRef = doc(db, 'users', this.userId, 'services', newService.id);
        await setDoc(docRef, newService);
      } catch (e) {
        console.error('Error writing service to Firebase', e);
      }
    }
    return newService;
  }

  async updateService(service: ServiceRecord): Promise<void> {
    const currentServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    const updatedServices = currentServices.map(s => s.id === service.id ? service : s);
    setLocalData(STORAGE_KEYS.SERVICES, updatedServices);
    this.triggerSyncChange();

    if (this.userId) {
      try {
        const docRef = doc(db, 'users', this.userId, 'services', service.id);
        await setDoc(docRef, service);
      } catch (e) {
        console.error('Error updating service on Firebase', e);
      }
    }
  }

  async deleteService(id: string): Promise<void> {
    const currentServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    const updatedServices = currentServices.filter(s => s.id !== id);
    setLocalData(STORAGE_KEYS.SERVICES, updatedServices);
    this.triggerSyncChange();

    if (this.userId) {
      try {
        const docRef = doc(db, 'users', this.userId, 'services', id);
        await deleteDoc(docRef);
      } catch (e) {
        console.error('Error deleting service from Firebase', e);
      }
    }
  }

  // SYNC OFFLINE DRAFTS TO FIREBASE (when logging in / back online)
  async syncLocalToFirebase(): Promise<void> {
    if (!this.userId) return;

    // 1. Sync vehicle
    const localVehicle = getLocalData<VehicleInfo | null>(STORAGE_KEYS.VEHICLE, null);
    if (localVehicle) {
      try {
        const docRef = doc(db, 'users', this.userId, 'vehicle', 'info');
        await setDoc(docRef, localVehicle);
      } catch (e) {
        console.error('Sync vehicle error', e);
      }
    }

    // 2. Sync trips
    const localTrips = getLocalData<TripRecord[]>(STORAGE_KEYS.TRIPS, []);
    for (const trip of localTrips) {
      try {
        const docRef = doc(db, 'users', this.userId, 'trips', trip.id);
        await setDoc(docRef, trip);
      } catch (e) {
        console.error('Sync trip error', e, trip);
      }
    }

    // 3. Sync services
    const localServices = getLocalData<ServiceRecord[]>(STORAGE_KEYS.SERVICES, []);
    for (const service of localServices) {
      try {
        const docRef = doc(db, 'users', this.userId, 'services', service.id);
        await setDoc(docRef, service);
      } catch (e) {
        console.error('Sync service error', e, service);
      }
    }

    this.triggerSyncChange();
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
