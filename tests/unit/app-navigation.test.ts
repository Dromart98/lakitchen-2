import { describe, expect, it } from "vitest";
import { isNavigationItemActive, navigationItems, type NavigationIconName } from "@/components/navigation/navigation-items";

const allowedIcons = new Set<NavigationIconName>(["home", "inventory", "macros", "plan", "settings"]);

describe("app navigation", () => {
  it("exposes the main app destinations", () => {
    expect(navigationItems.map((item) => [item.label, item.href])).toEqual([
      ["Inicio", "/dashboard"],
      ["Inventario", "/inventory"],
      ["Macros", "/macros"],
      ["Dieta", "/plan"],
      ["Ajustes", "/settings"],
    ]);
  });

  it("uses a different allowed icon for each section", () => {
    const icons = navigationItems.map((item) => item.icon);

    expect(icons.every((icon) => allowedIcons.has(icon))).toBe(true);
    expect(new Set(icons).size).toBe(5);
  });

  it("marks direct routes and nested routes as active", () => {
    const inventory = navigationItems.find((item) => item.href === "/inventory");
    expect(inventory).toBeDefined();
    expect(isNavigationItemActive("/inventory", inventory!)).toBe(true);
    expect(isNavigationItemActive("/inventory/barcodes", inventory!)).toBe(true);
  });

  it("marks meal history and weekly summary as macros routes", () => {
    const macros = navigationItems.find((item) => item.href === "/macros");
    expect(macros).toBeDefined();
    expect(isNavigationItemActive("/macros", macros!)).toBe(true);
    expect(isNavigationItemActive("/meal-history", macros!)).toBe(true);
    expect(isNavigationItemActive("/weekly-summary", macros!)).toBe(true);
    expect(isNavigationItemActive("/meal-builder", macros!)).toBe(false);
    expect(isNavigationItemActive("/plan", macros!)).toBe(false);
  });

  it("does not mark the compatibility meal builder route as part of diet", () => {
    const diet = navigationItems.find((item) => item.href === "/plan");
    expect(diet).toBeDefined();
    expect(isNavigationItemActive("/plan", diet!)).toBe(true);
    expect(isNavigationItemActive("/meal-builder", diet!)).toBe(false);
    expect(isNavigationItemActive("/macros", diet!)).toBe(false);
  });
});
