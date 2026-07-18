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
      <div className="settings-page">
        <header className="settings-header">
          <p className="settings-eyebrow">Ajustes</p>
          <h1>Haz LaKitchen tuya</h1>
          <p>Adapta la experiencia visual a tu gusto. Tus preferencias se aplican en este dispositivo.</p>
        </header>

        <section className="settings-appearance" aria-labelledby="appearance-title">
          <div className="settings-appearance__heading">
            <p className="settings-appearance__kicker">Tu espacio</p>
            <h2 id="appearance-title">Apariencia</h2>
            <p>Elige cómo quieres ver LaKitchen. La preferencia se guarda únicamente en este navegador.</p>
          </div>
          <ThemeSelector />
        </section>
      </div>
    </AppShell>
  );
}
