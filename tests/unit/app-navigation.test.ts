import { describe, expect, it } from "vitest";
import { isNavigationItemActive, navigationItems } from "@/components/navigation/navigation-items";

describe("app navigation", () => {
  it("exposes the main app destinations", () => {
    expect(navigationItems.map((item) => [item.label, item.href])).toEqual([
      ["Inicio", "/dashboard"],
      ["Inventario", "/inventory"],
      ["Macros", "/meal-builder"],
      ["Dieta", "/plan"],
      ["Ajustes", "/settings"],
    ]);
  });

  it("marks direct routes and nested routes as active", () => {
    const inventory = navigationItems.find((item) => item.href === "/inventory");
    expect(inventory).toBeDefined();
    expect(isNavigationItemActive("/inventory", inventory!)).toBe(true);
    expect(isNavigationItemActive("/inventory/barcodes", inventory!)).toBe(true);
  });

  it("marks meal history and weekly summary as macros routes", () => {
    const macros = navigationItems.find((item) => item.href === "/meal-builder");
    expect(macros).toBeDefined();
    expect(isNavigationItemActive("/meal-history", macros!)).toBe(true);
    expect(isNavigationItemActive("/weekly-summary", macros!)).toBe(true);
    expect(isNavigationItemActive("/plan", macros!)).toBe(false);
  });
});
