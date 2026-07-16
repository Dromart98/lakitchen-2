export type AppNavigationItem = {
  label: "Inicio" | "Inventario" | "Macros" | "Dieta" | "Ajustes";
  href: string;
  match: string[];
  icon: "home" | "inventory" | "macros" | "diet" | "settings";
};

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { label: "Inicio", href: "/dashboard", match: ["/dashboard"], icon: "home" },
  { label: "Inventario", href: "/inventory", match: ["/inventory"], icon: "inventory" },
  { label: "Macros", href: "/meal-builder", match: ["/meal-builder", "/meal-history", "/weekly-summary"], icon: "macros" },
  { label: "Dieta", href: "/plan", match: ["/plan"], icon: "diet" },
  { label: "Ajustes", href: "/settings", match: ["/settings"], icon: "settings" },
];

export function isNavigationItemActive(pathname: string, item: AppNavigationItem) {
  return item.match.some((matchPath) => pathname === matchPath || pathname.startsWith(`${matchPath}/`));
}
