// Shared shapes. These mirror the server contracts in server/src/*.js —
// change them together or not at all.

export type Mode = 'receive' | 'give';

export interface User {
  id: number;
  name: string;
  phone: string;
  isDeacon: boolean;
  status: 'pending' | 'approved' | 'rejected';
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Ride {
  id: number;
  riderId: number;
  riderName: string;
  pickup: LatLng;
  destination: LatLng & { label?: string };
  note?: string;
  status: 'open' | 'accepted';
  driverId?: number;
  driverName?: string;
  createdAt: string;
}

export interface Member {
  id: number;
  name: string;
  phone: string;
  isDeacon: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Invite {
  code: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdByName: string;
}

export interface SafetyReport {
  id: number;
  description: string;
  status: 'open' | 'resolved';
  createdAt: string;
  reporterName: string;
  subjectName: string | null;
}

export type LiveMessage =
  | { type: 'hello'; userId: number }
  | { type: 'rides_changed' }
  | { type: 'ride_accepted'; ride: Ride }
  | { type: 'ride_reopened'; ride: Ride }
  | { type: 'ride_ended'; rideId: number; reason: string }
  | { type: 'driver_location'; rideId: number; lat: number; lng: number }
  | { type: 'rider_location'; rideId: number; lat: number; lng: number };
