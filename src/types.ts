export interface VehicleInfo {
  id: string;
  brand: string;
  model: string;
  licensePlate: string;
  currentOdometer: number; // in km
  fuelType: string;
}

export interface TripRecord {
  id: string;
  date: string; // YYYY-MM-DD
  origin: string;
  destination: string;
  distance: number; // in km
  duration: number; // in minutes
  fuelCost: number; // in IDR
  fuelLiters: number; // in liters
  notes?: string;
  createdAt: string;
}

export interface ServiceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  serviceType: 'Oli Mesin' | 'Servis Rem' | 'Sistem Aki' | 'Rotasi Ban' | 'Tune Up' | 'Lainnya';
  cost: number; // in IDR
  currentOdometer: number; // in km
  nextServiceOdometer: number; // in km
  nextServiceDate: string; // YYYY-MM-DD
  notes?: string;
  status: 'Selesai' | 'Mendatang';
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  vehicle?: VehicleInfo;
  isBiometricRegistered?: boolean;
}
