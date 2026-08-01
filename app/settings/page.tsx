import { AppShell } from "@/components/layout/AppShell";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteAccountAction } from "./actions";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams?: Promise<{ accountError?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "settings");
  const params = await searchParams;
  const deletionError = params?.accountError;

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

        <section className="settings-danger" aria-labelledby="delete-account-title">
          <div className="settings-danger__heading">
            <p className="settings-danger__kicker">Zona sensible</p>
            <h2 id="delete-account-title">Eliminar cuenta</h2>
            <p>
              Tu cuenta y todos tus datos de LaKitchen se eliminarán definitivamente. Esta acción no se puede deshacer.
            </p>
          </div>

          {deletionError ? (
            <p className="settings-danger__error" role="alert">
              {deletionError === "confirmation-required"
                ? "Marca la confirmación antes de eliminar tu cuenta."
                : "No hemos podido eliminar tu cuenta. No se ha completado la eliminación; inténtalo de nuevo más tarde."}
            </p>
          ) : null}

          <form action={deleteAccountAction} className="settings-danger__form">
            <label className="settings-danger__confirmation">
              <input name="delete_confirmation" required type="checkbox" value="confirmed" />
              <span>Entiendo que mi cuenta y mis datos se eliminarán para siempre.</span>
            </label>
            <PendingSubmitButton
              className="settings-danger__button"
              idleLabel="Eliminar mi cuenta"
              pendingLabel="Eliminando cuenta…"
            />
          </form>
        </section>
      </div>
    </AppShell>
  );
}
