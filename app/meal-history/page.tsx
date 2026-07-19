import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
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
import {
  formatMealLogItemNutritionValue,
  getMealHistoryRepeatMode,
  sortMealLogItems,
  type MealLogItemRecord,
} from "@/modules/meals/meal-log-items";
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
  const isPastMeal = isPastMealHistoryDate(selectedDate, today);

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
    <AppShell>
      <div className="meal-history-page">
        <header className="meal-history-header">
          <p className="meal-history-eyebrow">Historial</p>
          <h1>Tus comidas, día a día</h1>
          <p>Revisa lo que has registrado, consulta los ingredientes utilizados y vuelve a preparar tus comidas anteriores.</p>
        </header>

        <section className="meal-history-date-panel" aria-labelledby="meal-history-date-heading">
          <div className="meal-history-date-panel__heading">
            <p>Fecha seleccionada</p>
            <h2 id="meal-history-date-heading">{formatSpanishUtcDate(selectedDate)}</h2>
          </div>
          <form className="meal-history-date-form" method="get" action="/meal-history">
            <label className="field" htmlFor="history-date">
              <span>Fecha</span>
              <input id="history-date" name="date" type="date" defaultValue={selectedDate} max={today} />
            </label>
            <button className="button" type="submit">Consultar</button>
          </form>
          <nav className="meal-history-navigation" aria-label="Navegación por fechas">
            <Link href={`/meal-history?date=${previousDate}`}>Día anterior</Link>
            <Link href={`/weekly-summary?week=${selectedDate}`}>Resumen semanal</Link>
            {selectedDate >= today ? (
              <span className="meal-history-navigation__disabled" aria-disabled="true">Día siguiente · No disponible</span>
            ) : (
              <Link href={`/meal-history?date=${nextHrefDate}`}>Día siguiente</Link>
            )}
          </nav>
          {(hasInvalidDate || mealErrorMessage) ? (
            <div className="meal-history-messages">
              {hasInvalidDate ? <p className="auth-message error" role="alert">Selecciona una fecha válida que no sea futura.</p> : null}
              {mealErrorMessage ? <p className="auth-message error" role="alert">{mealErrorMessage}</p> : null}
            </div>
          ) : null}
        </section>

        {mealLogsError ? (
          <section className="meal-history-load-error" role="alert">
            <p className="meal-history-eyebrow">Error de carga</p>
            <h2>No hemos podido mostrar este día</h2>
            <p>No se pudo cargar el historial de comidas. Inténtalo de nuevo.</p>
          </section>
        ) : (
          <>
            <section className="meal-history-summary" aria-labelledby="meal-history-summary-heading">
              <div className="meal-history-summary__calories">
                <p className="meal-history-eyebrow">Resumen diario</p>
                <h2 id="meal-history-summary-heading"><strong>{totals.calories}</strong> kcal</h2>
                <p>{getMealCountLabel(meals.length)}</p>
              </div>
              <div className="meal-history-summary__macros" aria-label="Macronutrientes totales">
                <div><span>Proteína</span><strong>{totals.proteinG}g</strong></div>
                <div><span>Carbohidratos</span><strong>{totals.carbsG}g</strong></div>
                <div><span>Grasas</span><strong>{totals.fatG}g</strong></div>
              </div>
              {mealItemsError ? <p className="meal-history-summary__error auth-message error" role="alert">No se pudo cargar el desglose de ingredientes.</p> : null}
            </section>

            {meals.length ? (
              <section className="meal-history-groups" aria-label="Comidas registradas por tipo">
                {groupedMeals.map((group) => (
                  <section className="meal-history-group" key={group.mealType} aria-labelledby={`meal-history-group-${group.mealType}`}>
                    <header className="meal-history-group__heading">
                      <h2 id={`meal-history-group-${group.mealType}`}>{group.label}</h2>
                      <span>{group.meals.length} {group.meals.length === 1 ? "comida" : "comidas"}</span>
                    </header>
                    <div className="meal-history-group__meals">
                    {group.meals.map((meal) => {
                      const mealItems = mealItemsByMealId.get(meal.id) ?? [];
                      const repeatMode = getMealHistoryRepeatMode({
                        snapshotsLoadedSuccessfully: !mealItemsError,
                        hasSnapshots: mealItems.length > 0,
                        isPastMeal,
                      });

                      return (
                        <article className="meal-history-meal" key={meal.id}>
                          <div className="meal-history-meal__heading">
                            <h3>{meal.name}</h3>
                            <p><strong>{meal.calories}</strong> kcal</p>
                          </div>
                          <div className="meal-history-meal__nutrition" aria-label={`Macronutrientes de ${meal.name}`}>
                            <span>Proteína <strong>{meal.protein_g}g</strong></span>
                            <span>Carbohidratos <strong>{meal.carbs_g}g</strong></span>
                            <span>Grasas <strong>{meal.fat_g}g</strong></span>
                          </div>
                          {(repeatMode === "composer" || repeatMode === "direct") ? <div className="meal-history-meal__actions">
                            {repeatMode === "composer" ? (
                              <Link href={`/macros?mealMode=ingredients&repeatMeal=${meal.id}#registrar-comida`}>
                                Revisar y repetir
                              </Link>
                            ) : null}
                            {repeatMode === "direct" ? (
                              <form action={repeatMealLogTodayAction}>
                                <input type="hidden" name="id" value={meal.id} />
                                <input
                                  type="hidden"
                                  name="source_date"
                                  value={selectedDate}
                                />
                                <button type="submit">
                                  Repetir hoy
                                </button>
                              </form>
                            ) : null}
                          </div> : null}
                          {mealItems.length ? (
                            <details className="meal-history-ingredients">
                              <summary>Ver ingredientes utilizados</summary>
                              <div className="meal-history-ingredients__list">
                                {sortMealLogItems(mealItems).map((item) => (
                                  <div key={item.id} className="meal-history-ingredient">
                                    <div>
                                      <strong>{item.product_name}</strong>
                                      <span>{formatMealLogItemNutritionValue(item.consumed_quantity)} {item.unit}</span>
                                    </div>
                                    <p>
                                      {formatMealLogItemNutritionValue(item.calories)} kcal · P {formatMealLogItemNutritionValue(item.protein_g)} g · C {formatMealLogItemNutritionValue(item.carbs_g)} g · G {formatMealLogItemNutritionValue(item.fat_g)} g
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </article>
                      );
                    })}
                    </div>
                  </section>
                ))}
              </section>
            ) : (
              <section className="meal-history-empty">
                <p className="meal-history-eyebrow">Sin registros</p>
                <h2>No hay comidas en esta fecha</h2>
                <p>No hay comidas registradas en esta fecha. Consulta otro día o registra tus comidas desde Inicio o Macros.</p>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
