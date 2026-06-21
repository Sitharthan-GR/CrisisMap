export type DistanceSystem = "metric" | "imperial";

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

/** Countries that use miles for everyday distance (US; UK uses km per product spec). */
const IMPERIAL_COUNTRIES = new Set([
  "united states",
  "united states of america",
  "usa",
  "us",
]);

export const RADIUS_STEPS: Record<DistanceSystem, readonly number[]> = {
  metric: [5, 10, 25, 50],
  imperial: [5, 10, 25, 50],
};

export function usesImperialDistance(country?: string | null): boolean {
  if (!country) return false;
  return IMPERIAL_COUNTRIES.has(country.trim().toLowerCase());
}

export function inferDistanceSystem(country?: string | null): DistanceSystem {
  if (usesImperialDistance(country)) return "imperial";

  if (typeof navigator !== "undefined") {
    const locale = navigator.language?.toLowerCase() ?? "";
    if (locale === "en-us" || locale.endsWith("-us")) return "imperial";
  }

  return "metric";
}

export function metersToDisplayValue(meters: number, system: DistanceSystem): number {
  const raw =
    system === "imperial" ? meters / METERS_PER_MILE : meters / METERS_PER_KM;
  return Math.round(raw);
}

export function displayValueToMeters(value: number, system: DistanceSystem): number {
  return system === "imperial" ? value * METERS_PER_MILE : value * METERS_PER_KM;
}

export function snapMetersToRadiusStep(
  meters: number,
  system: DistanceSystem,
): number {
  const steps = RADIUS_STEPS[system];
  const display = metersToDisplayValue(meters, system);
  let best = steps[0];
  let bestDiff = Math.abs(display - best);
  for (const step of steps) {
    const diff = Math.abs(display - step);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = step;
    }
  }
  return displayValueToMeters(best, system);
}

export function formatRadiusLabel(meters: number, system: DistanceSystem): string {
  const value = metersToDisplayValue(meters, system);
  return system === "imperial" ? `${value} mi` : `${value} km`;
}

export function formatDistance(meters: number, system: DistanceSystem): string {
  if (system === "imperial") {
    const feet = meters * 3.28084;
    if (feet < 5280) return `${Math.round(feet)} ft`;
    const miles = meters / METERS_PER_MILE;
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
  }

  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / METERS_PER_KM;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function radiusSliderConfig(system: DistanceSystem) {
  const steps = RADIUS_STEPS[system];
  return {
    min: steps[0],
    max: steps[steps.length - 1],
    step: 5,
  };
}

/** Preset radius options in meters (metric km steps — used internally). */
export const RADIUS_OPTIONS_METERS = RADIUS_STEPS.metric.map((km) => km * METERS_PER_KM);
