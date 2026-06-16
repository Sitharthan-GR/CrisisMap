export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", native: "English", dir: "ltr" as const },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl" as const },
  { code: "zh", label: "Chinese", native: "中文", dir: "ltr" as const },
  { code: "fr", label: "French", native: "Français", dir: "ltr" as const },
  { code: "ru", label: "Russian", native: "Русский", dir: "ltr" as const },
  { code: "es", label: "Spanish", native: "Español", dir: "ltr" as const },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "rapida-lang";
export const LANGUAGE_MANUAL_KEY = "rapida-lang-manual";

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === value);
}

export function languageMeta(code: SupportedLanguage) {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code)!;
}
