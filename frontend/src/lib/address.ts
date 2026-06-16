/** Shorten a Nominatim-style comma-separated address for compact UI. */
export function shortAddress(full: string, maxParts = 3): string {
  const trimmed = full.trim();
  if (!trimmed) return trimmed;

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= maxParts) return trimmed;
  return parts.slice(0, maxParts).join(", ");
}
