import type { TFunction } from "i18next";
import type { CrisisType } from "../types/report";

export const COMMON_CRISIS_SUBTYPES: Record<CrisisType, readonly string[]> = {
  natural_hazard: [
    "earthquake",
    "flood",
    "tsunami",
    "cyclone",
    "hurricane",
    "wildfire",
    "storm",
    "landslide",
    "drought",
    "volcano",
  ],
  technological: [
    "explosion",
    "chemical",
    "nuclear",
    "industrial_accident",
    "dam_failure",
    "power_outage",
    "infrastructure_failure",
  ],
  human_made: ["conflict", "terrorism", "civil_unrest", "displacement"],
};

export function subtypeOptionLabel(value: string, t: TFunction): string {
  const key = `nature.${value}`;
  const translated = t(key);
  if (translated !== key) {
    return translated;
  }
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
