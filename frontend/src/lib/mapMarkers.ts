import L from "leaflet";
import type { DamageLevel, InfraType } from "../types/report";
import { damageLevelClass } from "./severity";

export type NatureOfCrisis =
  | "earthquake"
  | "flood"
  | "tsunami"
  | "cyclone"
  | "wildfire"
  | "explosion"
  | "chemical"
  | "conflict";

export type MapMarkerIconKey = NatureOfCrisis | InfraType | "unknown";

const NATURE_KEYS = new Set<string>([
  "earthquake",
  "flood",
  "tsunami",
  "cyclone",
  "wildfire",
  "explosion",
  "chemical",
  "conflict",
]);

const INFRA_KEYS = new Set<string>([
  "residential",
  "commercial",
  "government",
  "utility",
  "transport",
  "community",
  "public_space",
  "other",
]);

/** Lucide-style 24×24 stroke paths (white on colored pin head). */
const ICON_PATHS: Record<MapMarkerIconKey, string> = {
  earthquake:
    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  flood:
    '<path d="M2 16c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/>',
  tsunami:
    '<path d="M2 12c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M2 16c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M12 4v4"/>',
  cyclone:
    '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3"/><path d="M9.6 4.6A2 2 0 1 1 11 8.2"/><path d="M12 12v2"/><path d="M4.6 13.4A2 2 0 1 0 6.8 16"/>',
  wildfire:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.5-1.5-3-1.5-5.5 0 2.5 1-4 2.5-5 1 2 2.5 3.5 2.5 5.5a2.5 2.5 0 0 0 2.5 2.5"/><path d="M12 18a3 3 0 0 0 3-3c0-2-2-3-2-5 0 2-1 3-2 4"/>',
  explosion:
    '<circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1"/>',
  chemical:
    '<path d="M10 2v6l-4 7a4 4 0 0 0 8 0l-4-7V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  conflict:
    '<path d="M14.5 17.5 17 15"/><path d="m6.5 6.5 3 3"/><path d="m2 22 5.5-5.5"/><path d="m17.5 2 4 4"/><path d="m9.5 6.5 8 8"/><path d="m14.5 17.5 16 16"/>',
  residential:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1V9.5"/>',
  commercial:
    '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/>',
  government:
    '<path d="M3 21h18"/><path d="M6 21V7l6-4 6 4v14"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>',
  utility:
    '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  transport:
    '<path d="M4 6h16"/><path d="M4 10h16"/><path d="M4 14h10"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  community:
    '<rect x="4" y="8" width="16" height="12" rx="1"/><path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M9 14h6M12 11v6"/>',
  public_space:
    '<path d="M12 22v-7"/><path d="M8 22v-4"/><path d="M16 22v-4"/><path d="M12 15a7 7 0 0 0 7-7c0-3-2-5-7-9-5 4-7 6-7 9a7 7 0 0 0 7 7z"/>',
  other:
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  unknown:
    '<path d="M12 9a3 3 0 0 1 2.8 4H12"/><circle cx="12" cy="17" r="0.5" fill="white" stroke="none"/>',
};

export function resolveMarkerIconKey(
  natureOfCrisis?: string | null,
  infraType?: InfraType,
): MapMarkerIconKey {
  const normalized = natureOfCrisis?.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized && NATURE_KEYS.has(normalized)) {
    return normalized as NatureOfCrisis;
  }
  if (infraType && INFRA_KEYS.has(infraType)) {
    return infraType;
  }
  return "unknown";
}

function markerSvg(iconKey: MapMarkerIconKey): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[iconKey]}</svg>`;
}

export function markerIconHtml(
  damageLevel: string,
  iconKey: MapMarkerIconKey,
  selected = false,
): string {
  const dmgClass = damageLevelClass(damageLevel);
  const selectedClass = selected ? " map-report-marker--selected" : "";
  return `<div class="map-report-marker map-report-marker--${dmgClass} map-report-marker--icon-${iconKey}${selectedClass}"><div class="map-report-marker__head">${markerSvg(iconKey)}</div><div class="map-report-marker__point" aria-hidden="true"></div></div>`;
}

export function createReportMapIcon(
  damageLevel: DamageLevel | string,
  natureOfCrisis?: string | null,
  infraType?: InfraType,
  selected = false,
): L.DivIcon {
  const iconKey = resolveMarkerIconKey(natureOfCrisis, infraType);
  const size = selected ? 38 : 32;
  const height = selected ? 46 : 40;
  return L.divIcon({
    className: "map-report-marker-wrap",
    html: markerIconHtml(damageLevel, iconKey, selected),
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
  });
}

/** All cause keys shown on the map help page. */
export const ALL_NATURE_KEYS: NatureOfCrisis[] = [
  "earthquake",
  "flood",
  "tsunami",
  "cyclone",
  "wildfire",
  "explosion",
  "chemical",
  "conflict",
];

export const ALL_INFRA_KEYS: InfraType[] = [
  "residential",
  "commercial",
  "government",
  "utility",
  "transport",
  "community",
  "public_space",
  "other",
];

export const LEGEND_DAMAGE_LEVELS: DamageLevel[] = [
  "minimal",
  "partial",
  "complete",
];
