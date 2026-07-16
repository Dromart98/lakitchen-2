import { describe, expect, it } from "vitest";

import {
  getInitialThemePreference,
  isThemePreference,
  normalizeThemePreference,
  resolveThemePreference,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from "@/lib/theme/theme-preference";

describe("theme preference helpers", () => {
  it("accepts exactly light, dark and system", () => {
    expect(THEME_PREFERENCES).toEqual(["light", "dark", "system"]);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("defaults missing or invalid stored values to light", () => {
    expect(getInitialThemePreference(null)).toBe("light");
    expect(getInitialThemePreference(undefined)).toBe("light");
    expect(normalizeThemePreference("unknown")).toBe("light");
  });

  it("resolves explicit light and dark without using the system setting", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("light", false)).toBe("light");
    expect(resolveThemePreference("dark", true)).toBe("dark");
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });

  it("resolves system from prefers-color-scheme", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });

  it("uses a stable localStorage key", () => {
    expect(THEME_STORAGE_KEY).toBe("lakitchen.theme.preference");
  });
});
