import { describe, expect, it } from "vitest";

import { APP_NAVIGATION_ITEMS, isNavigationItemActive } from "@/components/navigation/navigation-items";

describe("app navigation", () => {
  it("contains the five approved destinations in order", () => {
    expect(APP_NAVIGATION_ITEMS.map((item) => [item.label, item.href])).toEqual([
      ["Inicio", "/dashboard"],
      ["Inventario", "/inventory"],
      ["Macros", "/meal-builder"],
      ["Dieta", "/plan"],
      ["Ajustes", "/settings"],
    ]);
  });

  it("marks exact and nested routes as active", () => {
    const inventory = APP_NAVIGATION_ITEMS[1];
    expect(isNavigationItemActive("/inventory", inventory)).toBe(true);
    expect(isNavigationItemActive("/inventory/barcodes", inventory)).toBe(true);
    expect(isNavigationItemActive("/dashboard", inventory)).toBe(false);
  });

  it("maps macro history routes to the provisional Macros destination", () => {
    const macros = APP_NAVIGATION_ITEMS[2];
    expect(macros.href).toBe("/meal-builder");
    expect(isNavigationItemActive("/meal-history", macros)).toBe(true);
    expect(isNavigationItemActive("/weekly-summary", macros)).toBe(true);
  });
});
