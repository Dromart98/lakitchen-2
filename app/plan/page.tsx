import Link from "next/link";

import { DailyPlanGenerator } from "@/components/plan/DailyPlanGenerator";
import { buildDailyPlanTarget } from "@/modules/plans/daily-plan-ai";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileRow = { target_calories: number | null; target_protein_g: number | null; target_carbs_g: number | null; target_fat_g: number | null };

export default async function PlanPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "daily plan page");
  const { data: profile, error } = await (supabase as any)
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: ProfileRow | null; error: { message: string } | null };
  const target = buildDailyPlanTarget(profile);

  return (
    <main className="shell">
      <div className="topbar">
        <h1>Generar plan</h1>
        <Link className="logout-link" href="/dashboard">Volver</Link>
      </div>
      <p className="muted">Crea un plan para hoy usando tus objetivos nutricionales y los productos que ya tienes.</p>

      {error ? <p className="auth-message error" role="alert">No se pudo cargar tu perfil nutricional. Inténtalo de nuevo.</p> : null}

      {!target ? (
        <section className="card">
          <h2>Completa tu perfil nutricional</h2>
          <p className="muted">Necesitas objetivos diarios de calorías, proteína, hidratos y grasas antes de generar un plan. No se llamará a la IA hasta que el perfil esté completo.</p>
          <Link className="button nav-button" href="/nutrition-profile">Configurar perfil nutricional</Link>
        </section>
      ) : (
        <DailyPlanGenerator />
      )}
    </main>
  );
}
