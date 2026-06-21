import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resolveApproxUserLocation } from "../lib/geolocation";

import {
  isSupportedLanguage,
  LANGUAGE_MANUAL_KEY,
  LANGUAGE_STORAGE_KEY,
  languageMeta,
  type SupportedLanguage,
} from "./languages";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

const ARABIC_COUNTRIES = new Set([
  "algeria",
  "bahrain",
  "egypt",
  "iraq",
  "jordan",
  "kuwait",
  "lebanon",
  "libya",
  "morocco",
  "oman",
  "palestine",
  "qatar",
  "saudi arabia",
  "somalia",
  "sudan",
  "syria",
  "tunisia",
  "united arab emirates",
  "yemen",
  "الجزائر",
  "البحرين",
  "مصر",
  "العراق",
  "الأردن",
  "الكويت",
  "لبنان",
  "ليبيا",
  "المغرب",
  "عُمان",
  "فلسطين",
  "قطر",
  "السعودية",
  "الصومال",
  "السودان",
  "سوريا",
  "تونس",
  "الإمارات",
  "اليمن",
]);

const SPANISH_COUNTRIES = new Set([
  "spain",
  "mexico",
  "argentina",
  "colombia",
  "chile",
  "peru",
  "venezuela",
  "ecuador",
  "guatemala",
  "cuba",
  "bolivia",
  "honduras",
  "paraguay",
  "el salvador",
  "nicaragua",
  "costa rica",
  "panama",
  "uruguay",
  "españa",
  "méxico",
]);

const FRENCH_COUNTRIES = new Set([
  "france",
  "belgium",
  "senegal",
  "ivory coast",
  "haiti",
  "cameroon",
  "madagascar",
  "niger",
  "burkina faso",
  "mali",
  "rwanda",
  "guinea",
  "chad",
  "togo",
  "benin",
  "congo",
  "frança",
  "france",
]);

const RUSSIAN_COUNTRIES = new Set([
  "russia",
  "belarus",
  "kazakhstan",
  "kyrgyzstan",
  "ukraine",
  "russian federation",
  "россия",
  "україна",
  "украина",
  "беларусь",
]);

const CHINESE_COUNTRIES = new Set([
  "china",
  "taiwan",
  "hong kong",
  "macau",
  "中国",
  "台湾",
  "香港",
  "澳门",
]);

function normalizeLocaleTag(tag: string): SupportedLanguage | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith("ar")) return "ar";
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("en")) return "en";
  return null;
}

export function detectBrowserLanguage(): SupportedLanguage {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && isSupportedLanguage(saved)) {
    return saved;
  }

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ];

  for (const tag of candidates) {
    const match = normalizeLocaleTag(tag);
    if (match) return match;
  }

  return "en";
}

export function countryToLanguage(country?: string | null): SupportedLanguage | null {
  if (!country) return null;
  const normalized = country.trim().toLowerCase();

  if (ARABIC_COUNTRIES.has(normalized)) return "ar";
  if (CHINESE_COUNTRIES.has(normalized)) return "zh";
  if (FRENCH_COUNTRIES.has(normalized)) return "fr";
  if (RUSSIAN_COUNTRIES.has(normalized)) return "ru";
  if (SPANISH_COUNTRIES.has(normalized)) return "es";

  return null;
}

export function applyDocumentLanguage(lang: SupportedLanguage) {
  const meta = languageMeta(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = meta.dir;
}

export function setAppLanguage(lang: SupportedLanguage, manual = false) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  if (manual) {
    localStorage.setItem(LANGUAGE_MANUAL_KEY, "1");
  }
  applyDocumentLanguage(lang);
  void i18n.changeLanguage(lang);
}

export function hasManualLanguageChoice(): boolean {
  return localStorage.getItem(LANGUAGE_MANUAL_KEY) === "1";
}

let lastLanguageDetectKey = "";
let lastLanguageDetectAt = 0;

export async function suggestLanguageFromCoords(
  lat: number,
  lng: number,
): Promise<SupportedLanguage | null> {
  try {
    const response = await fetch(
      `/api/v1/geocode/reverse?lat=${lat}&lng=${lng}`,
    );
    if (!response.ok) return null;
    const body = await response.json();
    // admin_level_1 is the country name from our reverse geocode API
    return countryToLanguage(body?.data?.admin_level_1);
  } catch {
    return null;
  }
}

export async function autoDetectLanguageFromLocation(
  lat: number,
  lng: number,
): Promise<SupportedLanguage | null> {
  if (hasManualLanguageChoice()) return null;

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const now = Date.now();
  if (key === lastLanguageDetectKey && now - lastLanguageDetectAt < 30_000) {
    return null;
  }
  lastLanguageDetectKey = key;
  lastLanguageDetectAt = now;

  const suggested = await suggestLanguageFromCoords(lat, lng);
  if (suggested) {
    setAppLanguage(suggested, false);
    return suggested;
  }
  return null;
}

/** Try device GPS, then IP/ISP location, then map coordinates. */
export async function tryInitialLocationLanguage(
  fallbackLat: number,
  fallbackLng: number,
): Promise<void> {
  if (hasManualLanguageChoice()) return;

  const resolved = await resolveApproxUserLocation({
    latitude: fallbackLat,
    longitude: fallbackLng,
  });
  await autoDetectLanguageFromLocation(resolved.latitude, resolved.longitude);
}

const initialLanguage = detectBrowserLanguage();
applyDocumentLanguage(initialLanguage);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    zh: { translation: zh },
    fr: { translation: fr },
    ru: { translation: ru },
    es: { translation: es },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
