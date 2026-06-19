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
  ReportingOptions,
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

function adminHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function adminLogin(
  password: string,
  signal?: AbortSignal,
): Promise<{ token: string; expires_in: number }> {
  const response = await fetch(`${API_BASE_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    signal,
  });
  return parseApiResponse<{ token: string; expires_in: number }>(response);
}

export interface AdminCrisisCreateInput {
  name: string;
  crisis_type: Crisis["crisis_type"];
  crisis_subtype: string;
  onset_at: string;
  epicenter_lat?: number;
  epicenter_lng?: number;
}

export async function adminFetchCrises(
  token: string,
  signal?: AbortSignal,
): Promise<Crisis[]> {
  const response = await fetch(`${API_BASE_URL}/admin/crises`, {
    headers: adminHeaders(token),
    signal,
  });
  return parseApiResponse<Crisis[]>(response);
}

export async function adminCreateCrisis(
  token: string,
  payload: AdminCrisisCreateInput,
  signal?: AbortSignal,
): Promise<Crisis> {
  const response = await fetch(`${API_BASE_URL}/admin/crises`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
    signal,
  });
  return parseApiResponse<Crisis>(response);
}

export async function adminUpdateCrisis(
  token: string,
  crisisId: string,
  payload: { name?: string; status?: Crisis["status"] },
  signal?: AbortSignal,
): Promise<Crisis> {
  const response = await fetch(`${API_BASE_URL}/admin/crises/${crisisId}`, {
    method: "PATCH",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
    signal,
  });
  return parseApiResponse<Crisis>(response);
}

export async function adminFetchUnlistedReports(
  token: string,
  signal?: AbortSignal,
): Promise<ReportDetail[]> {
  const response = await fetch(`${API_BASE_URL}/admin/reports/unlisted`, {
    headers: adminHeaders(token),
    signal,
  });
  return parseApiResponse<ReportDetail[]>(response);
}

export async function adminAssignUnlistedReport(
  token: string,
  reportId: string,
  crisisId: string,
  signal?: AbortSignal,
): Promise<{ report: Report; crisis: Crisis }> {
  const response = await fetch(
    `${API_BASE_URL}/admin/reports/${reportId}/assign`,
    {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ crisis_id: crisisId }),
      signal,
    },
  );
  return parseApiResponse<{ report: Report; crisis: Crisis }>(response);
}

export async function adminCreateCrisisFromReport(
  token: string,
  reportId: string,
  payload: AdminCrisisCreateInput,
  signal?: AbortSignal,
): Promise<{ report: Report; crisis: Crisis }> {
  const response = await fetch(
    `${API_BASE_URL}/admin/reports/${reportId}/create-crisis`,
    {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify(payload),
      signal,
    },
  );
  return parseApiResponse<{ report: Report; crisis: Crisis }>(response);
}

export async function adminDeleteUnlistedReport(
  token: string,
  reportId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/admin/reports/${reportId}`, {
    method: "DELETE",
    headers: adminHeaders(token),
    signal,
  });
  await parseApiResponse<{ deleted: boolean }>(response);
}

export interface ExportQueryParams {
  status?: "validated" | "all";
  date_from?: string;
  date_to?: string;
}

export type ExportFormat = "csv" | "geojson" | "shapefile";

export interface AdminExportOptions {
  crisisId: string | "all";
  format: ExportFormat;
  params?: ExportQueryParams;
}

function buildExportQuery(params?: ExportQueryParams): string {
  const search = new URLSearchParams();
  if (params?.status) {
    search.set("status", params.status);
  }
  if (params?.date_from) {
    search.set("date_from", params.date_from);
  }
  if (params?.date_to) {
    search.set("date_to", params.date_to);
  }
  return search.toString();
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadCrisisExport(
  crisisId: string,
  format: "csv" | "geojson",
  params?: ExportQueryParams,
): void {
  const search = new URLSearchParams(buildExportQuery(params));
  const query = search.toString();
  const url = `${API_BASE_URL}/crises/${crisisId}/export/${format}${
    query ? `?${query}` : ""
  }`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function downloadAdminExport(
  token: string,
  options: AdminExportOptions,
  signal?: AbortSignal,
): Promise<void> {
  const search = new URLSearchParams(buildExportQuery(options.params));
  search.set("crisis_id", options.crisisId);

  const response = await fetch(
    `${API_BASE_URL}/admin/export/${options.format}?${search.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    },
  );

  if (!response.ok) {
    let message = `Export failed (${response.status})`;
    try {
      const body = (await response.json()) as ApiEnvelope<unknown>;
      message = body.error?.message ?? message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message);
  }

  const blob = await response.blob();
  const fallbackName =
    options.format === "shapefile"
      ? `rapida_${options.crisisId}.zip`
      : `rapida_${options.crisisId}.${options.format === "geojson" ? "geojson" : "csv"}`;
  const filename =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    fallbackName;

  if (options.format === "csv" || options.format === "geojson") {
    const text = await blob.text();
    triggerBrowserDownload(new Blob([text], { type: blob.type }), filename);
    return;
  }

  triggerBrowserDownload(blob, filename);
}

export async function fetchActiveCrises(
  signal?: AbortSignal,
): Promise<Crisis[]> {
  const response = await fetch(`${API_BASE_URL}/crises?status=active`, {
    signal,
  });
  return parseApiResponse<Crisis[]>(response);
}

export async function fetchReportingOptions(
  coords?: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<ReportingOptions> {
  const params = new URLSearchParams();
  if (coords) {
    params.set("lat", String(coords.lat));
    params.set("lng", String(coords.lng));
  }
  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/crises/reporting-options${query ? `?${query}` : ""}`,
    { signal },
  );
  return parseApiResponse<ReportingOptions>(response);
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
