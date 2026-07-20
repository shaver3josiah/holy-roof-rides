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
  /** open -> accepted (driver on the way) -> picked_up -> gone (completed/cancelled) */
  status: 'open' | 'accepted' | 'picked_up';
  driverId?: number;
  driverName?: string;
  createdAt: string;
}

/** The congregation's public meeting place (the only location the server stores). */
export interface Church {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** A named point — geocoder results and locally-saved recent destinations. */
export interface Place {
  label: string;
  lat: number;
  lng: number;
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
  | { type: 'ride_picked_up'; ride: Ride }
  | { type: 'ride_reopened'; ride: Ride }
  | { type: 'ride_ended'; rideId: number; reason: string }
  | { type: 'driver_location'; rideId: number; lat: number; lng: number }
  | { type: 'rider_location'; rideId: number; lat: number; lng: number };
