import Link from "next/link";
import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";
import { AppNavigation } from "@/components/navigation/AppNavigation";
import { MobileBottomNav } from "@/components/navigation/MobileBottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <div className="shell app-shell">
        <header className="app-shell__header">
          <Link className="app-shell__brand-link" href="/dashboard" aria-label="Ir a Inicio">
            <LaKitchenLogo variant="horizontal" theme="light" title="LaKitchen" />
          </Link>
          <AppNavigation />
          <form action="/auth/signout" method="post">
            <button className="logout-link" type="submit">Cerrar sesión</button>
          </form>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
      <MobileBottomNav />
    </>
  );
}
