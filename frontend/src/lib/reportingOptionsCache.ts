import type { ReportingOptions } from "../types/report";

const CACHE_KEY = "crisismap_reporting_options";
const CACHE_AT_KEY = "crisismap_reporting_options_at";

export function saveReportingOptionsCache(options: ReportingOptions): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(options));
    localStorage.setItem(CACHE_AT_KEY, new Date().toISOString());
  } catch {
    // ignore quota / private mode errors
  }
}

export function loadReportingOptionsCache(): ReportingOptions | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReportingOptions;
  } catch {
    return null;
  }
}

export function loadReportingOptionsCachedAt(): string | null {
  try {
    return localStorage.getItem(CACHE_AT_KEY);
  } catch {
    return null;
  }
}

export function formatReportingOptionsCachedAt(iso: string, locale?: string): string {
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}
