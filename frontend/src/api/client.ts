import type { FeatureCollection } from "geojson";
import { API_BASE_URL } from "../lib/constants";
import type {
  ApiEnvelope,
  Crisis,
  MapFeatureCollection,
  Photo,
  PhotoConfirmInput,
  PhotoInitiateInput,
  PhotoInitiateResult,
  Report,
  ReportCreateInput,
  ReportDetail,
  ReportVersion,
} from "../types/report";

export interface BuildingBbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T> | null = null;

  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if (!response.ok) {
      throw new ApiError(`Request failed (${response.status})`);
    }
    throw new ApiError("Invalid response from server.");
  }

  if (!response.ok || body.error) {
    throw new ApiError(
      body.error?.message ?? `Request failed (${response.status})`,
      body.error?.code,
    );
  }

  if (body.data === null || body.data === undefined) {
    throw new ApiError("Empty response from server.");
  }

  return body.data;
}

export async function fetchActiveCrises(
  signal?: AbortSignal,
): Promise<Crisis[]> {
  const response = await fetch(`${API_BASE_URL}/crises?status=active`, {
    signal,
  });
  return parseApiResponse<Crisis[]>(response);
}

export async function fetchCrisisMap(
  crisisId: string,
  options?: { status?: "validated" | "all" },
  signal?: AbortSignal,
): Promise<MapFeatureCollection> {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set("status", options.status);
  }

  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/crises/${crisisId}/map${query ? `?${query}` : ""}`,
    { signal },
  );
  return parseApiResponse<MapFeatureCollection>(response);
}

export async function createReport(
  payload: ReportCreateInput,
  signal?: AbortSignal,
): Promise<Report> {
  const response = await fetch(`${API_BASE_URL}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return parseApiResponse<Report>(response);
}

export async function fetchReportDetail(
  reportId: string,
  signal?: AbortSignal,
): Promise<ReportDetail> {
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, { signal });
  return parseApiResponse<ReportDetail>(response);
}

export async function fetchReportVersions(
  reportId: string,
  signal?: AbortSignal,
): Promise<ReportVersion[]> {
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/versions`, {
    signal,
  });
  return parseApiResponse<ReportVersion[]>(response);
}

export async function initiatePhotoUpload(
  reportId: string,
  payload: PhotoInitiateInput,
  signal?: AbortSignal,
): Promise<PhotoInitiateResult> {
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/photos/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return parseApiResponse<PhotoInitiateResult>(response);
}

export async function confirmPhotoUpload(
  reportId: string,
  payload: PhotoConfirmInput,
  signal?: AbortSignal,
): Promise<Photo> {
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/photos/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return parseApiResponse<Photo>(response);
}

export interface ReverseGeocodeResult {
  admin_level_1?: string | null;
  admin_level_2?: string | null;
  admin_level_3?: string | null;
  display_name?: string | null;
}

export interface PlaceSearchResult {
  display_name: string;
  latitude: number;
  longitude: number;
  place_id?: number | null;
  place_type?: string | null;
}

export async function fetchReverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  const response = await fetch(`${API_BASE_URL}/geocode/reverse?${params}`, {
    signal,
  });
  return parseApiResponse<ReverseGeocodeResult>(response);
}

export async function searchPlaces(
  query: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const response = await fetch(`${API_BASE_URL}/geocode/search?${params}`, {
    signal,
  });
  const data = await parseApiResponse<{ results: PlaceSearchResult[] }>(response);
  return data.results;
}

export async function fetchBuildingFootprints(
  bbox: BuildingBbox,
  signal?: AbortSignal,
): Promise<FeatureCollection> {
  const params = new URLSearchParams({
    south: String(bbox.south),
    west: String(bbox.west),
    north: String(bbox.north),
    east: String(bbox.east),
  });

  const response = await fetch(
    `${API_BASE_URL}/buildings/footprints?${params}`,
    { signal },
  );

  if (!response.ok) {
    let message = `Building data request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body?.error?.message ?? body?.detail?.[0]?.msg ?? message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message);
  }

  return response.json();
}
