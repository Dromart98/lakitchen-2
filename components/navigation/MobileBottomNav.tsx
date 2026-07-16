"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { isNavigationItemActive, navigationItems } from "./navigation-items";

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
      {navigationItems.map((item) => {
        const active = isNavigationItemActive(pathname, item);
        return <Link key={item.href} href={item.href} className={active ? "mobile-bottom-nav__link is-active" : "mobile-bottom-nav__link"} aria-current={active ? "page" : undefined}><NavIcon name={item.icon} /><span>{item.label}</span></Link>;
      })}
    </nav>
  );
}
