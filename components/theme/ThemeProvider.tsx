"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getInitialThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  const resolvedTheme = resolveThemePreference(preference, systemPrefersDark);

  useEffect(() => {
    const storedPreference = getInitialThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
    const prefersDark = readSystemPrefersDark();

    setPreferenceState(storedPreference);
    setSystemPrefersDark(prefersDark);
    applyTheme(resolveThemePreference(storedPreference, prefersDark));
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const contextValue = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    setPreference(nextPreference) {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
      setPreferenceState(nextPreference);
      applyTheme(resolveThemePreference(nextPreference, readSystemPrefersDark()));
    },
  }), [preference, resolvedTheme]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
