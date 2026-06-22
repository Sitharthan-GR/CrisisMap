export interface GeocodeLabelFields {
  display_name?: string | null;
  admin_level_1?: string | null;
  admin_level_2?: string | null;
  admin_level_3?: string | null;
}

/** Prefer full display name, then admin levels, then fallback. */
export function resolveGeocodeLabel(
  geo: GeocodeLabelFields,
  fallback: string,
): string {
  const display = geo.display_name?.trim();
  if (display) return display;
  return briefLocationFromAdmin(geo) ?? fallback;
}

/** Shorten a Nominatim-style comma-separated address for compact UI. */
export function shortAddress(full: string, maxParts = 3): string {
  const trimmed = full.trim();
  if (!trimmed) return trimmed;

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= maxParts) return trimmed;
  return parts.slice(0, maxParts).join(", ");
}

export function briefLocationFromAdmin(location?: {
  admin_level_1?: string | null;
  admin_level_2?: string | null;
  admin_level_3?: string | null;
} | null): string | null {
  if (!location) return null;

  const parts = [
    location.admin_level_3,
    location.admin_level_2,
    location.admin_level_1,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;
  return shortAddress(parts.join(", "), 2);
}

/** Full admin hierarchy for detail views (city, region, country). */
export function formatStoredAddress(location?: {
  admin_level_1?: string | null;
  admin_level_2?: string | null;
  admin_level_3?: string | null;
} | null): string | null {
  if (!location) return null;

  const parts = [
    location.admin_level_3,
    location.admin_level_2,
    location.admin_level_1,
  ].filter((part): part is string => Boolean(part?.trim()));

  return parts.length > 0 ? parts.join(", ") : null;
}
