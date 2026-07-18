import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  formatSpanishUtcDate,
  getTodayUtcDate,
} from "@/modules/meals/meal-date";
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
  const label = new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function WeeklySummaryPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "weekly summary");
  const today = getTodayUtcDate();
  const currentWeekStart = getUtcWeekMonday(today);
  const resolvedSearchParams = await searchParams;
  const { selectedDate, weekStart, weekEnd, hasInvalidWeek } =
    resolveWeeklySummaryDate(resolvedSearchParams?.week, today);
  const weekDates = getUtcWeekDates(weekStart);
  const effectiveWeekEnd = weekStart === currentWeekStart ? today : weekEnd;
  const nextWeekStart = getNextUtcWeek(weekStart);
  const canNavigateNext =
    !isUtcWeekAfterCurrentWeek(nextWeekStart, today) &&
    weekStart < currentWeekStart;

  const { data: mealLogs, error: mealLogsError } = (await (supabase as any)
    .from("daily_meal_logs")
    .select(
      "id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on, created_at",
    )
    .eq("user_id", user.id)
    .gte("consumed_on", weekStart)
    .lte("consumed_on", effectiveWeekEnd)
    .order("consumed_on", { ascending: true })
    .order("created_at", { ascending: true })) as {
    data: DailyMealLogRow[] | null;
    error: { message: string } | null;
  };

  if (mealLogsError) {
    console.warn(
      "Supabase could not load the weekly meal summary:",
      mealLogsError.message,
    );
  }

  const meals = mealLogsError ? [] : (mealLogs ?? []);
  const totals = sumMacros(
    meals.map((meal) => ({
      calories: meal.calories,
      proteinG: meal.protein_g,
      carbsG: meal.carbs_g,
      fatG: meal.fat_g,
    })),
  );
  const mealsByDay = new Map(
    weekDates.map((date) => [
      date,
      meals.filter((meal) => meal.consumed_on === date),
    ]),
  );
  const daysWithMeals = weekDates.filter(
    (date) => (mealsByDay.get(date)?.length ?? 0) > 0,
  ).length;

  return (
    <AppShell>
      <div className="weekly-summary-page">
        <header className="weekly-summary-header">
          <p className="weekly-summary-eyebrow">Resumen semanal</p>
          <h1>Tu semana de un vistazo</h1>
          <p>
            Revisa los totales y la constancia diaria de la semana seleccionada.
          </p>
        </header>

        <section
          className="weekly-summary-week-panel"
          aria-labelledby="weekly-summary-week-heading"
        >
          <div className="weekly-summary-week-heading">
            <div>
              <p>Semana seleccionada</p>
              <h2 id="weekly-summary-week-heading">
                {formatSpanishUtcWeekRange(weekStart, weekEnd)}
              </h2>
            </div>
            {weekStart === currentWeekStart ? <span>Semana actual</span> : null}
          </div>
          <form
            className="weekly-summary-week-form"
            method="get"
            action="/weekly-summary"
          >
            <label className="field" htmlFor="weekly-summary-week">
              <span>Semana</span>
              <input
                id="weekly-summary-week"
                name="week"
                type="date"
                defaultValue={selectedDate}
                max={today}
              />
            </label>
            <button className="button" type="submit">
              Consultar
            </button>
          </form>
          {hasInvalidWeek ? (
            <div className="weekly-summary-messages">
              <p className="auth-message error" role="alert">
                Selecciona una semana válida que no sea futura.
              </p>
            </div>
          ) : null}
          <nav
            className="weekly-summary-navigation"
            aria-label="Navegación por semanas"
          >
            <Link
              href={`/weekly-summary?week=${getPreviousUtcWeek(weekStart)}`}
            >
              Semana anterior
            </Link>
            {canNavigateNext ? (
              <Link href={`/weekly-summary?week=${nextWeekStart}`}>
                Semana siguiente
              </Link>
            ) : (
              <span
                className="weekly-summary-navigation__disabled"
                aria-disabled="true"
              >
                Semana siguiente · No disponible
              </span>
            )}
            <Link href={`/meal-history?date=${selectedDate}`}>
              Ver historial diario
            </Link>
          </nav>
        </section>

        {mealLogsError ? (
          <section className="weekly-summary-load-error" role="alert">
            <p className="weekly-summary-eyebrow">Error de carga</p>
            <h2>No hemos podido mostrar esta semana</h2>
            <p>No se pudo cargar el resumen semanal. Inténtalo de nuevo.</p>
          </section>
        ) : (
          <>
            <section
              className="weekly-summary-overview"
              aria-labelledby="weekly-summary-overview-heading"
            >
              <div className="weekly-summary-overview__calories">
                <p className="weekly-summary-eyebrow">Total semanal</p>
                <h2 id="weekly-summary-overview-heading">
                  <strong>{totals.calories}</strong> kcal
                </h2>
              </div>
              <div
                className="weekly-summary-overview__macros"
                aria-label="Macronutrientes totales"
              >
                <div>
                  <span>Proteína</span>
                  <strong>{totals.proteinG}g</strong>
                </div>
                <div>
                  <span>Carbohidratos</span>
                  <strong>{totals.carbsG}g</strong>
                </div>
                <div>
                  <span>Grasas</span>
                  <strong>{totals.fatG}g</strong>
                </div>
              </div>
              <div className="weekly-summary-overview__meta">
                <p>{getMealCountLabel(meals.length)}</p>
                <p>{getDaysWithMealsLabel(daysWithMeals)}</p>
              </div>
            </section>

            {meals.length === 0 ? (
              <section className="weekly-summary-empty">
                <p className="weekly-summary-eyebrow">Sin registros</p>
                <h2>Esta semana todavía está vacía</h2>
                <p>
                  No hay comidas registradas en esta semana. Puedes revisar otra
                  semana o registrar comida desde Inicio o Macros.
                </p>
              </section>
            ) : null}

            <section
              className="weekly-summary-days-section"
              aria-labelledby="weekly-summary-days-heading"
            >
              <header>
                <p className="weekly-summary-eyebrow">Desglose semanal</p>
                <h2 id="weekly-summary-days-heading">Día a día</h2>
                <p>
                  Consulta los totales registrados en cada fecha de la semana.
                </p>
              </header>
              <div className="weekly-summary-days">
                {weekDates.map((date) => {
                  const dayMeals = mealsByDay.get(date) ?? [];
                  const dayTotals = sumMacros(
                    dayMeals.map((meal) => ({
                      calories: meal.calories,
                      proteinG: meal.protein_g,
                      carbsG: meal.carbs_g,
                      fatG: meal.fat_g,
                    })),
                  );
                  const isFutureDay = date > today;

                  return (
                    <article
                      className={`weekly-summary-day${isFutureDay ? " weekly-summary-day__future" : ""}`}
                      key={date}
                    >
                      <header className="weekly-summary-day__heading">
                        <h3>{formatDayName(date)}</h3>
                        <p>{formatSpanishUtcDate(date)}</p>
                      </header>
                      {isFutureDay ? (
                        <div className="weekly-summary-day__status">
                          <strong>Día futuro</strong>
                          <span>Sin datos disponibles todavía</span>
                        </div>
                      ) : (
                        <>
                          <p className="weekly-summary-day__calories">
                            <strong>{dayTotals.calories}</strong> kcal
                          </p>
                          <div
                            className="weekly-summary-day__macros"
                            aria-label={`Macronutrientes de ${formatDayName(date)}`}
                          >
                            <span>
                              Proteína <strong>{dayTotals.proteinG}g</strong>
                            </span>
                            <span>
                              Carbohidratos <strong>{dayTotals.carbsG}g</strong>
                            </span>
                            <span>
                              Grasas <strong>{dayTotals.fatG}g</strong>
                            </span>
                          </div>
                          <p className="weekly-summary-day__status">
                            {dayMeals.length
                              ? getMealCountLabel(dayMeals.length)
                              : "Sin comidas registradas"}
                          </p>
                          <Link
                            className="weekly-summary-day__action"
                            href={`/meal-history?date=${date}`}
                          >
                            Ver día
                          </Link>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
