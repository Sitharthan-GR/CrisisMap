/** Default map center — Knoxville, TN (matches API examples) */
export const DEFAULT_CENTER = {
  lat: 35.9606,
  lng: -83.9207,
} as const;

export const DEFAULT_RADIUS_METERS = 10_000;

/** Sentinel value for the dashboard crisis selector (not a real crisis UUID). */
export const ALL_CRISES_ID = "__all__";

export const RADIUS_OPTIONS = [
  { label: "5 km", value: 5_000 },
  { label: "10 km", value: 10_000 },
  { label: "25 km", value: 25_000 },
  { label: "50 km", value: 50_000 },
] as const;

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

/** Narrated product walkthrough (help page). Override with VITE_DEMO_VIDEO_URL. */
export const DEMO_VIDEO_URL =
  import.meta.env.VITE_DEMO_VIDEO_URL ?? "/crisismap-demo.mp4";

export const REPORTER_NAME_STORAGE_KEY = "rapida_reporter_name";

export const ADMIN_TOKEN_STORAGE_KEY = "rapida_admin_token";
