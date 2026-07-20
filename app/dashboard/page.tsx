import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

import { ExpiringList } from "@/components/inventory/ExpiringList";
import { MacroProgress } from "@/components/nutrition/MacroProgress";
import { getInventoryExpirationAlertItems } from "@/modules/inventory/inventory-expiration";
import { remainingMacros, sumMacros } from "@/modules/meals/meal-summary";
import { MEAL_TYPE_LABELS, MEAL_TYPES, normalizeMealType } from "@/modules/meals/meal-types";
import { deleteMealLogAction } from "./actions";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItemRecord } from "@/modules/inventory/inventory.types";

type NutritionProfileTargetsRow = {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
};

type DailyMealLogRow = {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
  meal_type: string | null;
};

type InventoryItemsQueryResult = {
  data: InventoryItemRecord[] | null;
  error: { message: string } | null;
};

function getProfileGoal(profile: NutritionProfileTargetsRow | null): MacroTotals | null {
  if (!profile) return null;

  const { target_calories: calories, target_protein_g: proteinG, target_carbs_g: carbsG, target_fat_g: fatG } = profile;

  if (calories === null || proteinG === null || carbsG === null || fatG === null) {
    return null;
  }

  return { calories, proteinG, carbsG, fatG };
}


export const dynamic = "force-dynamic";


export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard");

  const { data: profile, error } = await supabase
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: NutritionProfileTargetsRow | null; error: { message: string } | null };

  const today = new Date().toISOString().slice(0, 10);
  const { data: mealLogs, error: mealLogsError } = await supabase
    .from("daily_meal_logs")
    .select("id, name, calories, protein_g, carbs_g, fat_g, created_at, meal_type")
    .eq("user_id", user.id)
    .eq("consumed_on", today)
    .order("created_at", { ascending: false }) as { data: DailyMealLogRow[] | null; error: { message: string } | null };

  const { data: inventoryData, error: inventoryError } = await supabase
    .from("inventory_items")
    .select("id, name, location, category, nutrition_basis, calories, protein_g, carbs_g, fat_g, quantity, unit, expires_at, created_at")
    .eq("user_id", user.id)
    .gt("quantity", 0)
    .order("created_at", { ascending: true }) as InventoryItemsQueryResult;

  if (error) {
    console.warn("Supabase could not load the dashboard nutrition profile:", error.message);
  }

  if (mealLogsError) {
    console.warn("Supabase could not load the dashboard meal logs:", mealLogsError.message);
  }

  if (inventoryError) {
    console.warn("Supabase could not load the dashboard inventory items:", inventoryError.message);
  }

  const inventoryItems = inventoryError ? [] : inventoryData ?? [];
  const mealsToday = mealLogsError ? [] : mealLogs ?? [];
  const groupedMeals = MEAL_TYPES.map((mealType) => ({
    mealType,
    label: MEAL_TYPE_LABELS[mealType],
    meals: mealsToday.filter((meal) => normalizeMealType(meal.meal_type) === mealType),
  })).filter((group) => group.meals.length > 0);
  const consumedToday = sumMacros(mealsToday.map((meal) => ({
    calories: meal.calories,
    proteinG: meal.protein_g,
    carbsG: meal.carbs_g,
    fatG: meal.fat_g,
  })));
  const goal = getProfileGoal(profile ?? null);
  const remaining = goal ? remainingMacros(goal, consumedToday) : null;
  const expiring = getInventoryExpirationAlertItems(inventoryItems, today);

  return (
    <AppShell>
      <header className="dashboard-hero">
        <span className="pill dashboard-hero__eyebrow">Resumen de hoy</span>
        <h1>Hoy en tu cocina</h1>
        <p className="muted dashboard-hero__copy">
          Revisa de un vistazo tus macros, las comidas registradas y los productos que conviene usar pronto.
        </p>
      </header>

      <div className="dashboard-alerts">
        {error ? (
          <p className="auth-message error" role="alert">
            No se pudo cargar tu perfil nutricional. Inténtalo de nuevo.
          </p>
        ) : null}

        {inventoryError ? (
          <p className="auth-message error" role="alert">
            No se pudo cargar tu inventario. Inténtalo de nuevo.
          </p>
        ) : null}
      </div>

      {goal && remaining ? (
        <section className="dashboard-nutrition" aria-labelledby="nutrition-summary-title">
          <div className="dashboard-nutrition__progress">
            <MacroProgress consumed={consumedToday} goal={goal} />
          </div>
          <div className="card dashboard-remaining-card">
            <span className="pill">Queda para hoy</span>
            <h2 id="nutrition-summary-title">Energía disponible</h2>
            <p className="dashboard-remaining-card__value"><strong>{remaining.calories}</strong><span>kcal</span></p>
            <p className="muted dashboard-remaining-card__hint">Calorías restantes según tu objetivo diario.</p>
            <div className="dashboard-macro-chips" aria-label="Macronutrientes restantes">
              <div className="dashboard-macro-chip">
                <span>Proteína</span>
                <strong>{remaining.proteinG} g</strong>
              </div>
              <div className="dashboard-macro-chip">
                <span>Carbohidratos</span>
                <strong>{remaining.carbsG} g</strong>
              </div>
              <div className="dashboard-macro-chip">
                <span>Grasas</span>
                <strong>{remaining.fatG} g</strong>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="card dashboard-profile-card" aria-labelledby="nutrition-profile-title">
          <span className="pill">Objetivos diarios</span>
          <h2 id="nutrition-profile-title">Configura tu perfil nutricional</h2>
          <p className="muted">
            Aún no hay objetivos diarios guardados para tu usuario. Completa tu perfil para ver calorías,
            proteína, carbohidratos y grasas personalizados.
          </p>
          <Link className="button nav-button" href="/nutrition-profile">
            Crear perfil nutricional
          </Link>
        </section>
      )}

      <section className="card dashboard-quick-actions" aria-labelledby="quick-actions-title">
        <div>
          <h2 id="quick-actions-title">Siguiente paso útil</h2>
          <p className="muted">Acciones rápidas para completar tu día sin repetir la navegación principal.</p>
        </div>
        <div className="dashboard-quick-actions__links">
          <Link className="button dashboard-action-button dashboard-action-button--primary" href="/macros?mealMode=ingredients#registrar-comida">
            Registrar comida
          </Link>
          <Link className="button dashboard-action-button" href="/inventory">
            Revisar inventario
          </Link>
          <Link className="button dashboard-action-button" href="/recipes?mode=all">
            Ver recetas
          </Link>
          <Link className="button dashboard-action-button" href="/plan">
            Generar plan
          </Link>
        </div>
      </section>

      <section className="card dashboard-meals-card" aria-labelledby="today-meals-title">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="today-meals-title">Comidas registradas hoy</h2>
            <p className="muted">Desayuno, comida, merienda y cena separados para leer el día con calma.</p>
          </div>
        </div>
        {mealsToday.length ? (
          <div className="dashboard-meal-groups">
            {groupedMeals.map((group) => (
              <section key={group.mealType} className="dashboard-meal-group" aria-labelledby={`meal-group-${group.mealType}`}>
                <h3 id={`meal-group-${group.mealType}`}>{group.label}</h3>
                <ul className="dashboard-meal-list">
                  {group.meals.map((meal) => (
                    <li className="dashboard-meal-item" key={meal.id}>
                      <div className="dashboard-meal-item__content">
                        <strong>{meal.name}</strong>
                        <span className="dashboard-meal-item__calories">{meal.calories} kcal</span>
                        <span className="muted dashboard-meal-item__macros">
                          Proteína {meal.protein_g} g · Carbohidratos {meal.carbs_g} g · Grasas {meal.fat_g} g
                        </span>
                      </div>
                      <div className="dashboard-meal-item__actions">
                        <Link className="button dashboard-meal-action" href={`/dashboard/meals/${meal.id}/edit`}>Editar</Link>
                        <form action={deleteMealLogAction} className="dashboard-delete-form">
                          <input type="hidden" name="id" value={meal.id} />
                          <button className="button dashboard-meal-action dashboard-meal-action--danger" type="submit">
                            Eliminar comida
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="muted dashboard-empty-state">Aún no has registrado comidas hoy.</p>
        )}
      </section>


      <section className="dashboard-support-grid">
        <ExpiringList items={expiring} todayKey={today} />
        <div className="card dashboard-recipes-card">
          <span className="pill">Inspiración</span>
          <h2>Recetas con tu inventario</h2>
          <p className="muted">
            {inventoryItems.length === 0
              ? "Ya puedes consultar recetas del catálogo. Añade productos para saber cuáles puedes preparar ahora."
              : "Ya puedes consultar recetas según tu inventario, el tiempo disponible y los productos próximos a caducar."}
          </p>
          <div className="dashboard-recipes-card__actions">
            <Link className="button nav-button" href="/recipes?mode=all">
              Ver recetas
            </Link>
            {inventoryItems.length === 0 ? (
              <Link className="logout-link" href="/inventory">
                Gestionar inventario
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
