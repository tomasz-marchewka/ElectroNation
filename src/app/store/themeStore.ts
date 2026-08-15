// Theme bridge: `data-theme="dark"|"light"` on <html>, dark by default
// (design system readme, "VISUAL FOUNDATIONS"). App layer only — the engine
// wall does not reach here, so localStorage is fair game.

import { create } from "zustand";

export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "electronation.theme";

/** Narrows a stored/unknown value to a theme; anything else falls back. */
export function parseTheme(value: string | null, fallback: Theme = DEFAULT_THEME): Theme {
  return value === "dark" || value === "light" ? value : fallback;
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be denied (private mode); the default theme still works.
    return DEFAULT_THEME;
  }
}

function persistTheme(theme: Theme): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A session without a remembered preference is acceptable.
  }
}

export interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(otherTheme(get().theme)),
}));
