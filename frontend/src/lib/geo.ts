import type { MapReportPin } from "../types/report";

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
