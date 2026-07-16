"use client";

import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme/theme-preference";
import { useTheme } from "./ThemeProvider";

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

const THEME_DESCRIPTIONS: Record<ThemePreference, string> = {
  light: "Usa siempre el tema claro mediterráneo.",
  dark: "Usa siempre el tema oscuro.",
  system: "Sigue la preferencia de color del dispositivo.",
};

export function ThemeSelector() {
  const { preference, setPreference, resolvedTheme } = useTheme();

  return (
    <fieldset className="theme-selector" aria-describedby="theme-selector-help">
      <legend>Tema</legend>
      <p id="theme-selector-help" className="muted">
        Elige cómo quieres ver LaKitchen. Se guarda únicamente en este dispositivo. Tema activo: {resolvedTheme === "dark" ? "oscuro" : "claro"}.
      </p>
      <div className="theme-selector__options" role="radiogroup" aria-label="Preferencia de tema">
        {THEME_PREFERENCES.map((themePreference) => (
          <label className="theme-selector__option" key={themePreference} data-selected={preference === themePreference}>
            <input
              type="radio"
              name="theme-preference"
              value={themePreference}
              checked={preference === themePreference}
              onChange={() => setPreference(themePreference)}
            />
            <span>
              <strong>{THEME_LABELS[themePreference]}</strong>
              <small>{THEME_DESCRIPTIONS[themePreference]}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
