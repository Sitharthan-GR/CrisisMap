import i18n from "../i18n";

export function damageLevelLabel(value?: string): string {
  const key = (value ?? "partial").toLowerCase();
  return i18n.t(`damage.${key}`, { defaultValue: key });
}

export function damageLevelColor(value?: string): string {
  const colors: Record<string, string> = {
    minimal: "var(--dmg-minimal)",
    partial: "var(--dmg-partial)",
    complete: "var(--dmg-complete)",
  };
  return colors[(value ?? "partial").toLowerCase()] ?? "var(--dmg-partial)";
}

export function damageLevelClass(value?: string): "complete" | "partial" | "minimal" {
  const key = (value ?? "partial").toLowerCase();
  if (key === "complete" || key === "partial" || key === "minimal") return key;
  return "partial";
}

export function infraTypeLabel(
  value?: string,
  subtype?: string | null,
): string {
  if (value === "other" && subtype?.trim()) {
    return subtype.trim();
  }
  if (!value) return i18n.t("infra.other");
  return i18n.t(`infra.${value}`, { defaultValue: value });
}

export function crisisTypeLabel(value?: string): string {
  return infraTypeLabel(value);
}
