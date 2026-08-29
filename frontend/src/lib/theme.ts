import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "crisismap-theme";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute("data-theme");
  const next: Theme = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export function getCurrentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

const CARTO_BASEMAP_HOST = "https://{s}.basemaps.cartocdn.com";

function cartoBasemapUrl(style: string): string {
  const base = `${CARTO_BASEMAP_HOST}/${style}/{z}/{x}/{y}{r}.png`;
  const key = import.meta.env.VITE_CARTO_API_KEY?.trim();
  if (!key) return base;
  return `${base}?key=${encodeURIComponent(key)}`;
}

export function basemapUrlForTheme(theme: Theme): string {
  const variant = theme === "light" ? "light_all" : "dark_all";
  return cartoBasemapUrl(variant);
}

export function basemapAttribution(): string {
  return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>';
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getCurrentTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
