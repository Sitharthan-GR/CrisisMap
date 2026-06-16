import i18n from "../i18n";

export function damageLevelLabel(value?: string): string {
  const key = (value ?? "partial").toLowerCase();
  return i18n.t(`damage.${key}`, { defaultValue: key });
}

export function damageLevelColor(value?: string): string {
  const colors: Record<string, string> = {
    minimal: "#22c55e",
    partial: "#f97316",
    complete: "#ef4444",
  };
  return colors[(value ?? "partial").toLowerCase()] ?? "#eab308";
}

export function infraTypeLabel(value?: string): string {
  if (!value) return i18n.t("infra.other");
  return i18n.t(`infra.${value}`, { defaultValue: value });
}

export function crisisTypeLabel(value?: string): string {
  return infraTypeLabel(value);
}
