import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

import { DailyPlanGenerator } from "@/components/plan/DailyPlanGenerator";
import { SavedDailyPlans } from "@/components/plan/SavedDailyPlans";
import { PlanViewTabs } from "@/components/plan/PlanViewTabs";
import {
  buildDailyPlanTarget,
  type DailyPlanInventorySourceItem,
} from "@/modules/plans/daily-plan-ai";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import {
  toSavedDailyPlan,
  type SavedDailyPlan,
} from "@/modules/plans/saved-daily-plans";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileRow = {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
};

export default async function PlanPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "daily plan page");

  const { data: profile, error } = (await (supabase as any)
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle()) as {
    data: ProfileRow | null;
    error: { message: string } | null;
  };
  const target = buildDailyPlanTarget(profile);

  const [
    { data: savedPlanData, error: savedPlanError },
    { data: inventoryData, error: inventoryError },
  ] = await Promise.all([
    (supabase as any)
      .from("user_saved_daily_plans")
      .select(
        "id, plan_date, priority_mode, max_minutes_per_meal, target, total, difference, fit, meals, completed_meals, created_at",
      )
      .eq("user_id", user.id)
      .order("plan_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100) as Promise<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>,
    (supabase as any)
      .from("inventory_items")
      .select(
        "id, name, quantity, unit, expires_at, category, nutrition_basis, calories, protein_g, carbs_g, fat_g",
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true }) as Promise<{
      data: DailyPlanInventorySourceItem[] | null;
      error: { message: string } | null;
    }>,
  ]);

  if (savedPlanError)
    console.warn("Supabase could not load saved daily plans.");
  if (inventoryError)
    console.warn("Supabase could not load inventory readiness.");
  const todayKey = getCurrentInventoryExpirationDateKey();

  const savedPlans = (savedPlanError ? [] : (savedPlanData ?? [])).reduce<
    SavedDailyPlan[]
  >((plans, row) => {
    const plan = toSavedDailyPlan(row);
    if (plan) plans.push(plan);
    return plans;
  }, []);

  return (
    <AppShell>
      <div className="plan-page">
        <header className="plan-header">
          <div className="plan-header__title">
            <span className="plan-header__icon" aria-hidden="true" />
            <div>
              <span className="plan-eyebrow">Dieta</span>
              <h1>Dieta con tu inventario</h1>
            </div>
          </div>
          <p>
            Genera un plan de cuatro comidas usando tus objetivos nutricionales
            y los productos que tienes disponibles.
          </p>
          {target ? (
            <p className="plan-header__target">
              {target.calories} kcal · P {target.protein_g} g · C{" "}
              {target.carbs_g} g · G {target.fat_g} g
            </p>
          ) : null}
          <Link
            className="plan-builder-link"
            href="/macros?mealMode=ingredients#registrar-comida"
          >
            Registrar comida desde inventario
          </Link>
        </header>
        <PlanViewTabs
          generate={
            !target ? (
              <section
                className="plan-profile-empty"
                aria-labelledby="plan-profile-title"
              >
                {error ? (
                  <p className="auth-message error" role="alert">
                    No se pudo cargar tu perfil nutricional. Inténtalo de nuevo.
                  </p>
                ) : null}
                <span className="plan-eyebrow">Configuración pendiente</span>
                <h2 id="plan-profile-title">
                  Completa tus objetivos nutricionales
                </h2>
                <p>
                  Necesitamos tus objetivos diarios de calorías, proteínas,
                  carbohidratos y grasas para preparar un plan adecuado.
                </p>
                <p className="plan-profile-empty__note">
                  No se llamará a la IA hasta que el perfil esté completo.
                </p>
                <Link
                  className="button plan-profile-empty__action"
                  href="/nutrition-profile"
                >
                  Configurar perfil nutricional
                </Link>
              </section>
            ) : (
              <>
                <>
                  {error ? (
                    <p className="auth-message error" role="alert">
                      No se pudo cargar tu perfil nutricional. Inténtalo de
                      nuevo.
                    </p>
                  ) : null}
                </>
                <>
                  {inventoryError ? (
                    <p className="auth-message error" role="alert">
                      No se pudo comprobar la preparación del inventario.
                    </p>
                  ) : null}
                </>
                <DailyPlanGenerator
                  inventoryItems={inventoryError ? [] : (inventoryData ?? [])}
                  todayKey={todayKey}
                />
              </>
            )
          }
          saved={
            <>
              <>
                {savedPlanError ? (
                  <p className="auth-message error" role="alert">
                    No se pudieron cargar tus planes guardados.
                  </p>
                ) : null}
              </>
              <SavedDailyPlans plans={savedPlans} todayKey={todayKey} />
            </>
          }
        />
      </div>
    </AppShell>
  );
}
