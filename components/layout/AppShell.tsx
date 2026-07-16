import type { ReactNode } from "react";

import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";
import { AppNavigation } from "@/components/navigation/AppNavigation";
import { MobileBottomNav } from "@/components/navigation/MobileBottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <LaKitchenLogo variant="horizontal" theme="light" title="LaKitchen" />
          <div className="app-header__actions">
            <AppNavigation />
            <form action="/auth/signout" method="post">
              <button className="logout-link app-header__logout" type="submit">Cerrar sesión</button>
            </form>
          </div>
        </div>
      </header>
      <main className="shell app-shell__content">{children}</main>
      <MobileBottomNav />
    </>
  );
}
