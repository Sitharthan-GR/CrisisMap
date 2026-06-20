import type { MapReportPin } from "../types/report";
import { DEFAULT_RADIUS_METERS, RADIUS_OPTIONS } from "./constants";

/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const radius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterReportsInRadius(
  reports: MapReportPin[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
): MapReportPin[] {
  return reports.filter(
    (report) =>
      distanceMeters(centerLat, centerLng, report.latitude, report.longitude) <=
      radiusMeters,
  );
}

export function reportsCentroid(
  reports: MapReportPin[],
): { lat: number; lng: number } | null {
  if (reports.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  for (const report of reports) {
    latSum += report.latitude;
    lngSum += report.longitude;
  }
  return {
    lat: latSum / reports.length,
    lng: lngSum / reports.length,
  };
}

export function hasValidEpicenter(
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number {
  return lat != null && lng != null && !(lat === 0 && lng === 0);
}

/** Pick the smallest preset radius that covers all reports from a center point. */
export function radiusForReports(
  reports: MapReportPin[],
  centerLat: number,
  centerLng: number,
): number {
  if (reports.length === 0) return DEFAULT_RADIUS_METERS;

  let maxDist = 0;
  for (const report of reports) {
    maxDist = Math.max(
      maxDist,
      distanceMeters(centerLat, centerLng, report.latitude, report.longitude),
    );
  }

  const padded = maxDist * 1.15 + 500;
  for (const option of RADIUS_OPTIONS) {
    if (padded <= option.value) return option.value;
  }
  return RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1].value;
}
