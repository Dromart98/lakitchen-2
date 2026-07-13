import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { repeatMealLogTodayAction } from "./actions";
import { createClient } from "@/lib/supabase/server";
import {
  formatSpanishUtcDate,
  getNextUtcDate,
  getPreviousUtcDate,
  getTodayUtcDate,
  isPastMealHistoryDate,
  resolveMealHistoryDate,
} from "@/modules/meals/meal-date";
import { formatMealLogItemNutritionValue, sortMealLogItems, type MealLogItemRecord } from "@/modules/meals/meal-log-items";
import { sumMacros } from "@/modules/meals/meal-summary";
import { MEAL_TYPE_LABELS, MEAL_TYPES, normalizeMealType } from "@/modules/meals/meal-types";

export const dynamic = "force-dynamic";

type MealLogItemRow = MealLogItemRecord & {
  id: string;
  meal_log_id: string;
  created_at: string;
};

type DailyMealLogRow = {
  id: string;
  name: string;
  meal_type: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
  consumed_on: string;
};

function getMealCountLabel(count: number): string {
  return `${count} ${count === 1 ? "comida registrada" : "comidas registradas"}`;
}

function getMealErrorMessage(code: string | undefined) {
  if (code === "repeat-not-found") return "No se encontró la comida que intentabas repetir.";
  if (code === "repeat-not-available") return "Solo puedes repetir comidas registradas en días anteriores.";
  if (code === "repeat-load-failed") return "No se pudo cargar la comida para repetirla. Inténtalo de nuevo.";
  if (code === "repeat-save-failed") return "No se pudo añadir la comida a hoy. Inténtalo de nuevo.";
  return null;
}

export default async function MealHistoryPage({ searchParams }: { searchParams?: Promise<{ date?: string; mealError?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "meal history");
  const today = getTodayUtcDate();
  const resolvedSearchParams = await searchParams;
  const { selectedDate, hasInvalidDate } = resolveMealHistoryDate(resolvedSearchParams?.date, today);
  const previousDate = getPreviousUtcDate(selectedDate);
  const nextDate = getNextUtcDate(selectedDate);
  const nextHrefDate = nextDate > today ? today : nextDate;
  const mealErrorMessage = getMealErrorMessage(resolvedSearchParams?.mealError);
  const canRepeatMeals = isPastMealHistoryDate(selectedDate, today);

  const { data: mealLogs, error: mealLogsError } = await (supabase as any)
    .from("daily_meal_logs")
    .select("id, name, meal_type, calories, protein_g, carbs_g, fat_g, created_at, consumed_on")
    .eq("user_id", user.id)
    .eq("consumed_on", selectedDate)
    .order("created_at", { ascending: false }) as { data: DailyMealLogRow[] | null; error: { message: string } | null };

  if (mealLogsError) {
    console.warn("Supabase could not load the meal history:", mealLogsError.message);
  }

  const meals = mealLogsError ? [] : mealLogs ?? [];
  const mealIds = meals.map((meal) => meal.id);
  let mealItemsByMealId = new Map<string, MealLogItemRow[]>();
  let mealItemsError = false;

  if (mealIds.length > 0) {
    const { data: mealItems, error } = await (supabase as any)
      .from("daily_meal_log_items")
      .select("id, meal_log_id, source_inventory_item_id, product_name, consumed_quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g, created_at")
      .in("meal_log_id", mealIds)
      .order("product_name", { ascending: true })
      .order("source_inventory_item_id", { ascending: true }) as { data: MealLogItemRow[] | null; error: { message: string } | null };

    if (error) {
      console.warn("Supabase could not load the meal history item snapshots:", error.message);
      mealItemsError = true;
    } else {
      mealItemsByMealId = (mealItems ?? []).reduce((itemsByMealId, item) => {
        const existingItems = itemsByMealId.get(item.meal_log_id) ?? [];
        existingItems.push(item);
        itemsByMealId.set(item.meal_log_id, existingItems);
        return itemsByMealId;
      }, new Map<string, MealLogItemRow[]>());
    }
  }
  const totals = sumMacros(meals.map((meal) => ({
    calories: meal.calories,
    proteinG: meal.protein_g,
    carbsG: meal.carbs_g,
    fatG: meal.fat_g,
  })));
  const groupedMeals = MEAL_TYPES.map((mealType) => ({
    mealType,
    label: MEAL_TYPE_LABELS[mealType],
    meals: meals.filter((meal) => normalizeMealType(meal.meal_type) === mealType),
  })).filter((group) => group.meals.length > 0);

  return (
    <main className="shell">
      <div className="topbar">
        <h1>Historial de comidas</h1>
        <Link className="button nav-button" href="/dashboard">Volver al dashboard</Link>
      </div>

      <section className="card">
        <h2>{formatSpanishUtcDate(selectedDate)}</h2>
        {hasInvalidDate ? <p className="auth-message error" role="alert">Selecciona una fecha válida que no sea futura.</p> : null}
        {mealErrorMessage ? <p className="auth-message error" role="alert">{mealErrorMessage}</p> : null}
        <form className="meal-log-form" method="get" action="/meal-history">
          <label className="field" htmlFor="history-date">
            <span>Fecha</span>
            <input id="history-date" name="date" type="date" defaultValue={selectedDate} max={today} />
          </label>
          <button className="button" type="submit">Consultar</button>
        </form>
        <div className="dashboard-actions" style={{ marginTop: 16 }}>
          <Link className="button nav-button" href={`/meal-history?date=${previousDate}`}>Día anterior</Link>
          <Link className="button nav-button" href={`/weekly-summary?week=${selectedDate}`}>Resumen semanal</Link>
          {selectedDate >= today ? (
            <span className="button nav-button" aria-disabled="true">Día siguiente</span>
          ) : (
            <Link className="button nav-button" href={`/meal-history?date=${nextHrefDate}`}>Día siguiente</Link>
          )}
        </div>
      </section>

      {mealLogsError ? (
        <section className="card" style={{ marginTop: 16 }}>
          <p className="auth-message error" role="alert">No se pudo cargar el historial de comidas. Inténtalo de nuevo.</p>
        </section>
      ) : (
        <>
          <section className="grid cards" style={{ marginTop: 16 }}>
            <div className="card">
              <h2>Resumen diario</h2>
              <p>{totals.calories} kcal</p>
              <p className="muted">P {totals.proteinG}g · C {totals.carbsG}g · G {totals.fatG}g</p>
              <p className="muted">{getMealCountLabel(meals.length)}</p>
              {mealItemsError ? <p className="auth-message error" role="alert">No se pudo cargar el desglose de ingredientes.</p> : null}
            </div>
          </section>

          {meals.length ? (
            <section className="grid cards" style={{ marginTop: 16 }}>
              {groupedMeals.map((group) => (
                <div className="card" key={group.mealType}>
                  <h2>{group.label}</h2>
                  <ul>
                    {group.meals.map((meal) => (
                      <li key={meal.id}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <span>
                            <strong>{meal.name}</strong> · {meal.calories} kcal · P {meal.protein_g}g · C {meal.carbs_g}g · G {meal.fat_g}g
                          </span>
                          {canRepeatMeals ? (
                            <form action={repeatMealLogTodayAction}>
                              <input type="hidden" name="id" value={meal.id} />
                              <input
                                type="hidden"
                                name="source_date"
                                value={selectedDate}
                              />
                              <button className="button" type="submit">
                                Repetir hoy
                              </button>
                            </form>
                          ) : null}
                          {mealItemsByMealId.get(meal.id)?.length ? (
                            <Link className="button nav-button" href={`/meal-builder?repeatMeal=${meal.id}`}>
                              Repetir en el compositor
                            </Link>
                          ) : null}
                        </div>
                        {mealItemsByMealId.get(meal.id)?.length ? (
                          <div style={{ marginTop: 8, marginLeft: 12 }}>
                            <p className="muted" style={{ margin: "0 0 4px" }}><strong>Ingredientes utilizados</strong></p>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {sortMealLogItems(mealItemsByMealId.get(meal.id) ?? []).map((item) => (
                                <li key={item.id} className="muted" style={{ marginTop: 4 }}>
                                  <span>
                                    <strong>{item.product_name}</strong> — {formatMealLogItemNutritionValue(item.consumed_quantity)} {item.unit}
                                  </span>
                                  <br />
                                  <span>
                                    {formatMealLogItemNutritionValue(item.calories)} kcal · P {formatMealLogItemNutritionValue(item.protein_g)} g · C {formatMealLogItemNutritionValue(item.carbs_g)} g · G {formatMealLogItemNutritionValue(item.fat_g)} g
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : (
            <section className="card" style={{ marginTop: 16 }}>
              <p className="muted">No hay comidas registradas en esta fecha.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
