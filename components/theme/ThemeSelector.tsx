"use client";

import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "@/lib/theme/theme-preference";

const options: { value: ThemePreference; label: string; description: string }[] = [
  { value: "light", label: "Claro", description: "Fondo luminoso y tonos crema." },
  { value: "dark", label: "Oscuro", description: "Una interfaz más tenue para ambientes con poca luz." },
  { value: "system", label: "Sistema", description: "Sigue automáticamente el tema de tu dispositivo." },
];

export function ThemeSelector() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <div className="theme-selector">
      <fieldset className="theme-selector__fieldset">
        <legend>Elige el tema de LaKitchen</legend>
        <div className="theme-options">
          {options.map((option) => (
            <label className="theme-option" key={option.value} htmlFor={`theme-${option.value}`}>
              <input
                className="theme-option__input"
                type="radio"
                id={`theme-${option.value}`}
                name="theme-preference"
                value={option.value}
                checked={preference === option.value}
                onChange={() => setPreference(option.value)}
              />
              <span className={`theme-option__preview theme-option__preview--${option.value}`} aria-hidden="true">
                <span />
              </span>
              <span className="theme-option__content">
                <span className="theme-option__heading">
                  <strong>{option.label}</strong>
                  {preference === option.value && <span className="theme-option__selected">Seleccionado</span>}
                </span>
                <span className="theme-option__description">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="theme-current-status" role="status" aria-live="polite">
        <span aria-hidden="true" />
        Tema aplicado ahora: <strong>{resolvedTheme === "light" ? "Claro" : "Oscuro"}</strong>
      </p>
      <p className="settings-device-note">
        Esta elección no modifica tu cuenta ni otros dispositivos. Si eliges Sistema, el aspecto cambiará automáticamente cuando lo haga el tema de tu dispositivo.
      </p>
    </div>
  );
}
