import Link from "next/link";

import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";
import { ExpiringList } from "@/components/inventory/ExpiringList";
import { MacroProgress } from "@/components/nutrition/MacroProgress";
import { getInventoryExpirationAlertItems } from "@/modules/inventory/inventory-expiration";
import { remainingMacros, sumMacros } from "@/modules/meals/meal-summary";
import { MEAL_TYPE_LABELS, MEAL_TYPES, normalizeMealType } from "@/modules/meals/meal-types";
import { addMealLogAction, deleteMealLogAction } from "./actions";
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

function getMealErrorMessage(code: string | undefined) {
  if (code === "meal-name-required") return "Escribe un nombre para la comida.";
  if (code === "meal-name-too-long") return "El nombre de la comida no puede superar los 120 caracteres.";
  if (code === "invalid-macros") return "Los macros deben ser números enteros de 0 o más.";
  if (code === "invalid-meal-type") return "Selecciona un tipo de comida válido.";
  if (code === "meal-not-found") return "No se encontró la comida de hoy.";
  if (code === "save-failed") return "No se pudo guardar la comida. Inténtalo de nuevo.";
  if (code === "delete-failed") return "No se pudo eliminar la comida. Inténtalo de nuevo.";
  if (code === "load-edit-failed") return "No se pudo cargar la comida para editar. Inténtalo de nuevo.";
  return null;
}

function getMealSuccessMessage(code: string | undefined) {
  if (code === "meal-created") return "Comida registrada correctamente.";
  if (code === "meal-deleted") return "Comida eliminada correctamente.";
  if (code === "meal-updated") return "Comida actualizada correctamente.";
  if (code === "meal-repeated") return "Comida repetida y añadida a hoy.";
  return null;
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ mealError?: string; mealSuccess?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard");

  const { data: profile, error } = await (supabase as any)
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: NutritionProfileTargetsRow | null; error: { message: string } | null };

  const today = new Date().toISOString().slice(0, 10);
  const { data: mealLogs, error: mealLogsError } = await (supabase as any)
    .from("daily_meal_logs")
    .select("id, name, calories, protein_g, carbs_g, fat_g, created_at, meal_type")
    .eq("user_id", user.id)
    .eq("consumed_on", today)
    .order("created_at", { ascending: false }) as { data: DailyMealLogRow[] | null; error: { message: string } | null };

  const { data: inventoryData, error: inventoryError } = await (supabase as any)
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
  const resolvedSearchParams = await searchParams;
  const mealErrorMessage = getMealErrorMessage(resolvedSearchParams?.mealError);
  const mealSuccessMessage = getMealSuccessMessage(resolvedSearchParams?.mealSuccess);
  const goal = getProfileGoal(profile ?? null);
  const remaining = goal ? remainingMacros(goal, consumedToday) : null;
  const expiring = getInventoryExpirationAlertItems(inventoryItems, today);

  return (
    <main className="shell">
      <div className="topbar">
        <LaKitchenLogo variant="horizontal" theme="light" title="LaKitchen" />
        <form action="/auth/signout" method="post">
          <button className="logout-link" type="submit">Cerrar sesión</button>
        </form>
      </div>

      <p className="muted">Dashboard mobile-first para macros, inventario y recetas.</p>

      <div className="dashboard-actions">
        <Link className="button nav-button" href="/nutrition-profile">
          Configurar perfil nutricional
        </Link>
        <Link className="button nav-button" href="/inventory">
          Inventario
        </Link>
        <Link className="button nav-button" href="/meal-builder">
          Componer comida
        </Link>
        <Link className="button nav-button" href="/plan">
          Generar plan
        </Link>
        <a className="button nav-button" href="/shopping-list">
          Lista de la compra
        </a>
        <Link className="button nav-button" href="/meal-history">
          Historial de comidas
        </Link>
        <Link className="button nav-button" href="/weekly-summary">
          Resumen semanal
        </Link>
      </div>

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

      {goal && remaining ? (
        <section className="grid cards">
          <MacroProgress consumed={consumedToday} goal={goal} />
          <div className="card">
            <h2>Restante</h2>
            <p>{remaining.calories} kcal</p>
            <p className="muted">
              P {remaining.proteinG}g · C {remaining.carbsG}g · G {remaining.fatG}g
            </p>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Configura tu perfil nutricional</h2>
          <p className="muted">
            Aún no hay objetivos diarios guardados para tu usuario. Completa tu perfil para ver calorías,
            proteína, carbohidratos y grasas personalizados.
          </p>
          <Link className="button nav-button" href="/nutrition-profile">
            Crear perfil nutricional
          </Link>
        </section>
      )}

      <section className="grid cards" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Registro manual rápido</h2>
          <p className="muted">Añade una comida consumida hoy para sumar sus macros al dashboard.</p>
          {mealErrorMessage ? <p className="auth-message error" role="alert">{mealErrorMessage}</p> : null}
          {mealSuccessMessage ? <p className="auth-message success">{mealSuccessMessage}</p> : null}
          <form action={addMealLogAction} className="meal-log-form">
            <label className="field" htmlFor="meal-name">
              <span>Nombre</span>
              <input id="meal-name" name="name" type="text" required placeholder="Pollo con arroz" />
            </label>
            <label className="field" htmlFor="meal-type">
              <span>Tipo de comida</span>
              <select id="meal-type" name="meal_type" required defaultValue="">
                <option value="" disabled>Selecciona un tipo</option>
                {MEAL_TYPES.map((mealType) => (
                  <option key={mealType} value={mealType}>{MEAL_TYPE_LABELS[mealType]}</option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="meal-calories">
              <span>Calorías</span>
              <input id="meal-calories" name="calories" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <label className="field" htmlFor="meal-protein">
              <span>Proteína (g)</span>
              <input id="meal-protein" name="protein_g" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <label className="field" htmlFor="meal-carbs">
              <span>Carbohidratos (g)</span>
              <input id="meal-carbs" name="carbs_g" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <label className="field" htmlFor="meal-fat">
              <span>Grasas (g)</span>
              <input id="meal-fat" name="fat_g" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <button className="button" type="submit">Registrar comida</button>
          </form>
        </div>

        <div className="card">
          <h2>Comidas registradas hoy</h2>
          {mealsToday.length ? (
            <div>
              {groupedMeals.map((group) => (
                <section key={group.mealType} style={{ marginTop: 12 }}>
                  <h3>{group.label}</h3>
                  <ul>
                    {group.meals.map((meal) => (
                      <li key={meal.id}>
                        <strong>{meal.name}</strong> · {meal.calories} kcal · P {meal.protein_g}g · C {meal.carbs_g}g · G {meal.fat_g}g
                        <Link className="button" href={`/dashboard/meals/${meal.id}/edit`} style={{ marginLeft: 8 }}>Editar</Link>
                        <form action={deleteMealLogAction} style={{ display: "inline", marginLeft: 8 }}>
                          <input type="hidden" name="id" value={meal.id} />
                          <button className="button" type="submit">Eliminar</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="muted">Aún no has registrado comidas hoy.</p>
          )}
        </div>
      </section>

      <section className="grid cards" style={{ marginTop: 16 }}>
        <ExpiringList items={expiring} todayKey={today} />
        <div className="card">
          <h2>Recetas con tu inventario</h2>
          <p className="muted">
            {inventoryItems.length === 0
              ? "Ya puedes consultar recetas del catálogo. Añade productos para saber cuáles puedes preparar ahora."
              : "Ya puedes consultar recetas según tu inventario, el tiempo disponible y los productos próximos a caducar."}
          </p>
          <Link className="button nav-button" href="/recipes?mode=all">
            Ver recetas
          </Link>
          {inventoryItems.length === 0 ? (
            <Link className="button nav-button" href="/inventory" style={{ marginLeft: 8 }}>
              Gestionar inventario
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
