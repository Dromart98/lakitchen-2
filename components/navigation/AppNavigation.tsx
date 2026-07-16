"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { isNavigationItemActive, navigationItems } from "./navigation-items";

export function AppNavigation() {
  const pathname = usePathname();
  return (
    <nav className="app-navigation" aria-label="Navegación principal">
      {navigationItems.map((item) => {
        const active = isNavigationItemActive(pathname, item);
        return <Link key={item.href} href={item.href} className={active ? "app-navigation__link is-active" : "app-navigation__link"} aria-current={active ? "page" : undefined}><NavIcon name={item.icon} />{item.label}</Link>;
      })}
    </nav>
  );
}
