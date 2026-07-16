import { describe, expect, it } from "vitest";
import { normalizeThemePreference, resolveThemePreference, THEME_STORAGE_KEY } from "@/lib/theme/theme-preference";

describe("theme preference", () => {
  it("keeps supported preferences", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
  });

  it("uses light as the default for absent or invalid preferences", () => {
    expect(normalizeThemePreference(null)).toBe("light");
    expect(normalizeThemePreference("sepia")).toBe("light");
  });

  it("resolves system from prefers-color-scheme", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });

  it("uses the expected storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("lakitchen.theme.preference");
  });
});
