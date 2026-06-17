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
