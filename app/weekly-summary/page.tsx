import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { formatSpanishUtcDate, getTodayUtcDate } from "@/modules/meals/meal-date";
import {
  formatSpanishUtcWeekRange,
  getNextUtcWeek,
  getPreviousUtcWeek,
  getUtcWeekDates,
  getUtcWeekMonday,
  isUtcWeekAfterCurrentWeek,
  resolveWeeklySummaryDate,
} from "@/modules/meals/meal-week";
import { sumMacros } from "@/modules/meals/meal-summary";

export const dynamic = "force-dynamic";

type DailyMealLogRow = {
  id: string;
  name: string;
  meal_type: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  consumed_on: string;
  created_at: string;
};

function getMealCountLabel(count: number): string {
  return `${count} ${count === 1 ? "comida registrada" : "comidas registradas"}`;
}

function getDaysWithMealsLabel(count: number): string {
  return `${count} de 7 días con registros`;
}

function formatDayName(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  const label = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "long" }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function WeeklySummaryPage({ searchParams }: { searchParams?: Promise<{ week?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "weekly summary");
  const today = getTodayUtcDate();
  const currentWeekStart = getUtcWeekMonday(today);
  const resolvedSearchParams = await searchParams;
  const { selectedDate, weekStart, weekEnd, hasInvalidWeek } = resolveWeeklySummaryDate(resolvedSearchParams?.week, today);
  const weekDates = getUtcWeekDates(weekStart);
  const effectiveWeekEnd = weekStart === currentWeekStart ? today : weekEnd;
  const nextWeekStart = getNextUtcWeek(weekStart);
  const canNavigateNext = !isUtcWeekAfterCurrentWeek(nextWeekStart, today) && weekStart < currentWeekStart;

  const { data: mealLogs, error: mealLogsError } = await (supabase as any)
    .from("daily_meal_logs")
    .select("id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on, created_at")
    .eq("user_id", user.id)
    .gte("consumed_on", weekStart)
    .lte("consumed_on", effectiveWeekEnd)
    .order("consumed_on", { ascending: true })
    .order("created_at", { ascending: true }) as { data: DailyMealLogRow[] | null; error: { message: string } | null };

  if (mealLogsError) {
    console.warn("Supabase could not load the weekly meal summary:", mealLogsError.message);
  }

  const meals = mealLogsError ? [] : mealLogs ?? [];
  const totals = sumMacros(meals.map((meal) => ({
    calories: meal.calories,
    proteinG: meal.protein_g,
    carbsG: meal.carbs_g,
    fatG: meal.fat_g,
  })));
  const mealsByDay = new Map(weekDates.map((date) => [date, meals.filter((meal) => meal.consumed_on === date)]));
  const daysWithMeals = weekDates.filter((date) => (mealsByDay.get(date)?.length ?? 0) > 0).length;

  return (
    <main className="shell">
      <div className="topbar">
        <h1>Resumen semanal</h1>
        <Link className="button nav-button" href="/dashboard">Volver al dashboard</Link>
      </div>

      <section className="card">
        <h2>{formatSpanishUtcWeekRange(weekStart, weekEnd)}</h2>
        {hasInvalidWeek ? <p className="auth-message error" role="alert">Selecciona una semana válida que no sea futura.</p> : null}
        <form className="meal-log-form" method="get" action="/weekly-summary">
          <label className="field" htmlFor="weekly-summary-week">
            <span>Semana</span>
            <input id="weekly-summary-week" name="week" type="date" defaultValue={selectedDate} max={today} />
          </label>
          <button className="button" type="submit">Consultar</button>
        </form>
        <div className="dashboard-actions" style={{ marginTop: 16 }}>
          <Link className="button nav-button" href={`/weekly-summary?week=${getPreviousUtcWeek(weekStart)}`}>Semana anterior</Link>
          {canNavigateNext ? (
            <Link className="button nav-button" href={`/weekly-summary?week=${nextWeekStart}`}>Semana siguiente</Link>
          ) : (
            <span className="button nav-button" aria-disabled="true">Semana siguiente</span>
          )}
          <Link className="button nav-button" href={`/meal-history?date=${selectedDate}`}>Ver historial diario</Link>
        </div>
      </section>

      {mealLogsError ? (
        <section className="card" style={{ marginTop: 16 }}>
          <p className="auth-message error" role="alert">No se pudo cargar el resumen semanal. Inténtalo de nuevo.</p>
        </section>
      ) : (
        <>
          <section className="grid cards" style={{ marginTop: 16 }}>
            <div className="card">
              <h2>Resumen de la semana</h2>
              <p>{totals.calories} kcal</p>
              <p className="muted">P {totals.proteinG}g · C {totals.carbsG}g · G {totals.fatG}g</p>
              <p className="muted">{getMealCountLabel(meals.length)}</p>
              <p className="muted">{getDaysWithMealsLabel(daysWithMeals)}</p>
            </div>
          </section>

          {meals.length === 0 ? (
            <section className="card" style={{ marginTop: 16 }}>
              <p className="muted">No hay comidas registradas en esta semana.</p>
            </section>
          ) : null}

          <section className="grid cards" style={{ marginTop: 16 }}>
            {weekDates.map((date) => {
              const dayMeals = mealsByDay.get(date) ?? [];
              const dayTotals = sumMacros(dayMeals.map((meal) => ({
                calories: meal.calories,
                proteinG: meal.protein_g,
                carbsG: meal.carbs_g,
                fatG: meal.fat_g,
              })));
              const isFutureDay = date > today;

              return (
                <div className="card" key={date}>
                  <h2>{formatDayName(date)}</h2>
                  <p className="muted">{formatSpanishUtcDate(date)}</p>
                  {isFutureDay ? (
                    <p className="muted">Día futuro</p>
                  ) : (
                    <>
                      <p>{dayTotals.calories} kcal</p>
                      <p className="muted">P {dayTotals.proteinG}g · C {dayTotals.carbsG}g · G {dayTotals.fatG}g</p>
                      <p className="muted">{dayMeals.length ? getMealCountLabel(dayMeals.length) : "Sin comidas registradas"}</p>
                      <Link className="button nav-button" href={`/meal-history?date=${date}`}>Ver día</Link>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
