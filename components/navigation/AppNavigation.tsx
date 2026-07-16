"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { APP_NAVIGATION_ITEMS, isNavigationItemActive } from "./navigation-items";
import { NavIcon } from "./NavIcon";

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="desktop-navigation" aria-label="Navegación principal">
      {APP_NAVIGATION_ITEMS.map((item) => {
        const isActive = isNavigationItemActive(pathname, item);

        return (
          <Link className="desktop-navigation__link" href={item.href as Route} key={item.href} aria-current={isActive ? "page" : undefined} data-active={isActive}>
            <NavIcon icon={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
