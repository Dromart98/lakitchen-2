import { describe, expect, it } from "vitest";
import { normalizeThemePreference, resolveThemePreference, THEME_STORAGE_KEY } from "@/lib/theme/theme-preference";

describe("theme preference", () => {
  it("keeps supported preferences", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
  });

  it("resolves absent and invalid preferences to light", () => {
    expect(normalizeThemePreference(null)).toBe("light");
    expect(normalizeThemePreference(undefined)).toBe("light");
    expect(normalizeThemePreference("sepia")).toBe("light");
  });

  it("resolves explicit light and dark preferences", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("light", false)).toBe("light");
    expect(resolveThemePreference("dark", true)).toBe("dark");
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });

  it("resolves system from prefers-color-scheme", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });

  it("uses the expected storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("lakitchen.theme.preference");
  });
});
