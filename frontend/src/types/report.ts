export type CrisisType = "natural_hazard" | "technological" | "human_made";
export type CrisisStatus = "active" | "closed";

export interface Crisis {
  id: string;
  name: string;
  crisis_type: CrisisType;
  crisis_subtype: string;
  epicenter_lat?: number | null;
  epicenter_lng?: number | null;
  status: CrisisStatus;
  is_unlisted?: boolean;
  form_template_id?: string | null;
  onset_at: string;
  created_at: string;
}

export interface ReportingOptions {
  crises: Crisis[];
  unlisted_crisis_id: string;
  nearest_crisis_id: string | null;
}

export type DamageLevel = "minimal" | "partial" | "complete";

export type InfraType =
  | "residential"
  | "commercial"
  | "government"
  | "utility"
  | "transport"
  | "community"
  | "public_space"
  | "other";

export type LocationMethod = "gps" | "what3words" | "manual" | "exif";

export interface ReportLocationInput {
  latitude?: number;
  longitude?: number;
  what3words?: string;
  location_method: LocationMethod;
  building_footprint_id?: string;
}

export interface ReportCreateInput {
  crisis_id: string;
  damage_level: DamageLevel;
  infra_type: InfraType;
  infra_subtype?: string;
  infra_name?: string;
  debris_present: boolean;
  nature_of_crisis?: string;
  description_raw?: string;
  reporter_name?: string;
  source_language?: string;
  submission_channel: "mobile" | "web";
  collected_at: string;
  location: ReportLocationInput;
  form_responses?: Record<string, unknown> | null;
}

export interface ReportLocation {
  id: string;
  latitude: number;
  longitude: number;
  what3words?: string | null;
  admin_level_1?: string | null;
  admin_level_2?: string | null;
  admin_level_3?: string | null;
}

export interface Report {
  id: string;
  crisis_id: string;
  location_id: string;
  damage_level: DamageLevel;
  infra_type: InfraType;
  infra_subtype?: string | null;
  infra_name?: string | null;
  debris_present: boolean;
  nature_of_crisis?: string | null;
  description_raw?: string | null;
  description_translated?: string | null;
  reporter_name?: string;
  source_language?: string | null;
  is_latest_version: boolean;
  version_number: number;
  submission_channel: "mobile" | "web";
  status: string;
  collected_at: string;
  submitted_at: string;
  location?: ReportLocation;
  form_responses?: Record<string, unknown> | null;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export interface MapReportProperties {
  location_id: string;
  report_id: string;
  damage_level: DamageLevel;
  infra_type: InfraType;
  nature_of_crisis?: string | null;
  report_count: number;
  admin_level_2?: string | null;
  latest_photo_thumbnail?: string | null;
}

export interface MapGeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: MapReportProperties;
}

export interface MapFeatureCollection {
  type: "FeatureCollection";
  features: MapGeoJsonFeature[];
  total: number;
}

export interface MapReportPin {
  id: string;
  locationId: string;
  latitude: number;
  longitude: number;
  damageLevel: DamageLevel;
  infraType: InfraType;
  natureOfCrisis?: string | null;
  reportCount: number;
  adminLevel2?: string | null;
  thumbnail?: string | null;
}

export type PhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface PhotoInitiateInput {
  mime_type: PhotoMimeType;
  file_size_kb: number;
}

export interface PhotoInitiateResult {
  photo_id: string;
  storage_path: string;
  upload_url: string;
  expires_in: number;
}

export interface PhotoConfirmInput {
  photo_id: string;
  storage_path: string;
  file_size_kb: number;
  mime_type: PhotoMimeType;
  captured_at?: string;
  gps_lat?: number;
  gps_lng?: number;
}

export interface Photo {
  id: string;
  report_id: string;
  storage_path: string;
  signed_url?: string | null;
  thumbnail_url?: string | null;
  file_size_kb?: number | null;
  mime_type?: string | null;
  captured_at?: string | null;
  uploaded_at: string;
}

export interface ReportVersion {
  id: string;
  version_number: number;
  damage_level: DamageLevel;
  is_latest_version: boolean;
  collected_at: string;
  submitted_at: string;
}

export interface ReportDetail extends Report {
  photos: Photo[];
}
