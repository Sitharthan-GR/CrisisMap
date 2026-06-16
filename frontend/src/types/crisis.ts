export type CrisisSeverity = "low" | "medium" | "high" | "critical";

export type CrisisType =
  | "flood"
  | "fire"
  | "earthquake"
  | "storm"
  | "accident"
  | "other"
  | string;

export interface CrisisRecord {
  id?: string | number;
  title?: string;
  description?: string;
  crisis_type?: CrisisType;
  severity?: CrisisSeverity | string;
  latitude?: number;
  longitude?: number;
  address_text?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  distance_meters?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface NearbyCrisisResponse {
  records: CrisisRecord[];
  count: number;
}

export interface MapViewport {
  lat: number;
  lng: number;
  radiusMeters: number;
}
