import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "crisismap-theme";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

export function basemapUrlForTheme(theme: Theme): string {
  const variant = theme === "light" ? "light_all" : "dark_all";
  return `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`;
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
