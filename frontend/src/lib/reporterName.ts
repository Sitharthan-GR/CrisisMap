import { REPORTER_NAME_STORAGE_KEY } from "./constants";

export function loadReporterName(): string {
  try {
    return localStorage.getItem(REPORTER_NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveReporterName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(REPORTER_NAME_STORAGE_KEY, trimmed);
  } catch {
    // ignore quota / private mode errors
  }
}

export function resolveReporterName(input: string): string {
  const trimmed = input.trim();
  return trimmed || "anonymous";
}
