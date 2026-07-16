import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "settings");

  return (
    <AppShell>
      <div className="section-heading">
        <div>
          <span className="pill">Preferencias</span>
          <h1>Ajustes</h1>
        </div>
      </div>

      <section className="card form-section" aria-labelledby="settings-theme-title">
        <h2 id="settings-theme-title">Tema</h2>
        <ThemeSelector />
      </section>

      <section className="card form-section" aria-labelledby="settings-links-title">
        <h2 id="settings-links-title">Opciones existentes</h2>
        <p className="muted">Accesos reales a configuraciones ya disponibles en LaKitchen.</p>
        <div className="settings-links">
          <Link className="logout-link" href="/nutrition-profile">Perfil nutricional</Link>
          <form action="/auth/signout" method="post">
            <button className="logout-link" type="submit">Cerrar sesión</button>
          </form>
        </div>
      </section>
    </AppShell>
  );
}
