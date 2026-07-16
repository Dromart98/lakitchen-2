"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { normalizeThemePreference, resolveThemePreference, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "@/lib/theme/theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [prefersDark, setPrefersDark] = useState(false);
  const initialized = useRef(false);

  const resolvedTheme = resolveThemePreference(preference, prefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const storedPreference = normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
    const systemPrefersDark = media.matches;

    setPrefersDark(systemPrefersDark);
    setPreferenceState(storedPreference);
    applyTheme(resolveThemePreference(storedPreference, systemPrefersDark));
    initialized.current = true;

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    const normalizedPreference = normalizeThemePreference(nextPreference);
    const nextResolvedTheme = resolveThemePreference(normalizedPreference, getPrefersDark());

    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedPreference);
    setPrefersDark(getPrefersDark());
    setPreferenceState(normalizedPreference);
    applyTheme(nextResolvedTheme);
  }, []);

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
