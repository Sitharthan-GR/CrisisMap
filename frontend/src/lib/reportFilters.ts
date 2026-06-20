import { distanceMeters } from "./geo";
import type { MapReportPin } from "../types/report";

export type DamageFilter = "all" | "complete" | "partial" | "minimal";
export type ReportSort = "newest" | "nearest" | "severe";

const SEVERE_RANK: Record<string, number> = {
  complete: 3,
  partial: 2,
  minimal: 1,
};

export function filterReportsByDamage(
  reports: MapReportPin[],
  filter: DamageFilter,
): MapReportPin[] {
  if (filter === "all") return reports;
  return reports.filter(
    (report) => report.damageLevel.toLowerCase() === filter,
  );
}

export function sortReports(
  reports: MapReportPin[],
  sort: ReportSort,
  centerLat: number,
  centerLng: number,
): MapReportPin[] {
  const copy = [...reports];

  switch (sort) {
    case "nearest":
      copy.sort(
        (a, b) =>
          distanceMeters(centerLat, centerLng, a.latitude, a.longitude) -
          distanceMeters(centerLat, centerLng, b.latitude, b.longitude),
      );
      break;
    case "severe":
      copy.sort(
        (a, b) =>
          (SEVERE_RANK[b.damageLevel.toLowerCase()] ?? 0) -
          (SEVERE_RANK[a.damageLevel.toLowerCase()] ?? 0),
      );
      break;
    case "newest":
    default:
      copy.sort((a, b) => b.id.localeCompare(a.id));
      break;
  }

  return copy;
}
