import type { Route } from "next";

export type NavigationIconName = "home" | "inventory" | "macros" | "plan" | "settings";
export type NavigationItem = { label: string; href: Route; icon: NavigationIconName; activePaths?: string[] };

export const navigationItems: NavigationItem[] = [
  { label: "Inicio", href: "/dashboard", icon: "home" },
  { label: "Inventario", href: "/inventory", icon: "inventory" },
  { label: "Macros", href: "/meal-builder", icon: "macros", activePaths: ["/meal-history", "/weekly-summary"] },
  { label: "Dieta", href: "/plan", icon: "plan" },
  { label: "Ajustes", href: "/settings", icon: "settings" },
];

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  const paths = [item.href, ...(item.activePaths ?? [])];
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
