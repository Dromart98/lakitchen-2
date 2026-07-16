"use client";

import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "@/lib/theme/theme-preference";

const options: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

export function ThemeSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <label className="theme-selector" htmlFor="theme-preference">
      <span>Tema</span>
      <select id="theme-preference" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
