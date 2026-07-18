import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

import { DailyPlanGenerator } from "@/components/plan/DailyPlanGenerator";
import { SavedDailyPlans } from "@/components/plan/SavedDailyPlans";
import { buildDailyPlanTarget, getDailyPlanInventoryReadiness, type DailyPlanInventorySourceItem } from "@/modules/plans/daily-plan-ai";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import { toSavedDailyPlan, type SavedDailyPlan } from "@/modules/plans/saved-daily-plans";
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

  const [{ data: savedPlanData, error: savedPlanError }, { data: inventoryData, error: inventoryError }] = await Promise.all([(supabase as any)
    .from("user_saved_daily_plans")
    .select("id, plan_date, priority_mode, max_minutes_per_meal, target, total, difference, fit, meals, completed_meals, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12) as Promise<{ data: unknown[] | null; error: { message: string } | null }>, (supabase as any)
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, category, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .order("name", { ascending: true }) as Promise<{ data: DailyPlanInventorySourceItem[] | null; error: { message: string } | null }>]);

  if (savedPlanError) console.warn("Supabase could not load saved daily plans.");
  if (inventoryError) console.warn("Supabase could not load inventory readiness.");
  const readiness = getDailyPlanInventoryReadiness(inventoryError ? [] : inventoryData ?? [], getCurrentInventoryExpirationDateKey());

  const savedPlans = (savedPlanError ? [] : savedPlanData ?? []).reduce<SavedDailyPlan[]>((plans, row) => {
    const plan = toSavedDailyPlan(row);
    if (plan) plans.push(plan);
    return plans;
  }, []);

  return (
    <AppShell>
      <div className="plan-page">
        <header className="plan-header">
          <span className="plan-eyebrow">Dieta</span>
          <h1>Tu plan para hoy</h1>
          <p>LaKitchen prepara un día completo de comidas a partir de tus objetivos nutricionales y los productos disponibles en tu inventario.</p>
          <div className="plan-builder-link">
            <div>
              <strong>Construye tu propia comida</strong>
              <span>Elige ingredientes de tu inventario y comprueba los macros antes de registrarla.</span>
            </div>
            <Link className="button" href="/meal-builder">Abrir compositor</Link>
          </div>
        </header>

        {(error || savedPlanError || inventoryError) ? (
          <div className="plan-load-errors">
            {error ? <p className="auth-message error" role="alert">No se pudo cargar tu perfil nutricional. Inténtalo de nuevo.</p> : null}
            {savedPlanError ? <p className="auth-message error" role="alert">No se pudieron cargar tus planes guardados.</p> : null}
            {inventoryError ? <p className="auth-message error" role="alert">No se pudo comprobar la preparación del inventario.</p> : null}
          </div>
        ) : null}

        {!target ? (
          <section className="plan-profile-empty" aria-labelledby="plan-profile-title">
            <span className="plan-eyebrow">Configuración pendiente</span>
            <h2 id="plan-profile-title">Completa tus objetivos nutricionales</h2>
            <p>Necesitamos tus objetivos diarios de calorías, proteínas, carbohidratos y grasas para preparar un plan adecuado.</p>
            <p className="plan-profile-empty__note">No se llamará a la IA hasta que el perfil esté completo.</p>
            <Link className="button plan-profile-empty__action" href="/nutrition-profile">Configurar perfil nutricional</Link>
          </section>
        ) : (
          <DailyPlanGenerator readiness={readiness} />
        )}

        <SavedDailyPlans plans={savedPlans} />
      </div>
    </AppShell>
  );
}
