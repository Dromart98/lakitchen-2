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
      <h1>Ajustes</h1>
      <p className="muted">Configura las preferencias visuales de LaKitchen en este dispositivo.</p>
      <section className="card settings-card">
        <h2>Apariencia</h2>
        <p className="muted">Elige tema claro, oscuro o el tema del sistema. La preferencia se guarda solo en este navegador.</p>
        <ThemeSelector />
      </section>
    </AppShell>
  );
}
