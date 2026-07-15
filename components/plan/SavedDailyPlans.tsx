import { deleteSavedDailyPlanAction } from "@/app/plan/actions";
import { CookSavedPlanMealButton } from "@/components/plan/CookSavedPlanMealButton";
import { MEAL_TYPE_LABELS } from "@/modules/meals/meal-types";
import type { DailyPlanNutrition } from "@/modules/plans/daily-plan-ai";
import type { SavedDailyPlan } from "@/modules/plans/saved-daily-plans";

const fitLabels = {
  close: "Muy cerca del objetivo",
  acceptable: "Ajuste razonable",
  far: "Se aleja del objetivo",
} as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function MacroLine({ value }: { value: DailyPlanNutrition }) {
  return (
    <p className="muted">
      {formatNumber(value.calories)} kcal · P {formatNumber(value.protein_g)} g · C {formatNumber(value.carbs_g)} g · G {formatNumber(value.fat_g)} g
    </p>
  );
}

export function SavedDailyPlans({ plans }: { plans: SavedDailyPlan[] }) {
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Planes guardados</h2>
      <p className="muted">Puedes registrar cada comida por separado. Solo entonces se descuentan sus ingredientes del inventario.</p>

      {plans.length === 0 ? <p className="muted">Todavía no has guardado ningún plan.</p> : null}

      {plans.map((plan) => (
        <article className="card" key={plan.id} style={{ marginTop: 12 }}>
          <div className="topbar">
            <div>
              <h3>Plan del {formatDate(`${plan.plan_date}T12:00:00.000Z`)}</h3>
              <p className="muted">Guardado el {formatDate(plan.created_at)} · {fitLabels[plan.fit]}</p>
              <MacroLine value={plan.total} />
            </div>
            <form action={deleteSavedDailyPlanAction}>
              <input type="hidden" name="plan_id" value={plan.id} />
              <button className="button secondary" type="submit">Eliminar</button>
            </form>
          </div>

          <details>
            <summary>Ver las cuatro comidas</summary>
            {plan.meals.map((meal) => (
              <section key={meal.meal_type} style={{ marginTop: 12 }}>
                <h4>{MEAL_TYPE_LABELS[meal.meal_type]} · {meal.title}</h4>
                <p className="muted">{meal.description} · {meal.estimated_minutes} minutos</p>
                <MacroLine value={meal.nutrition} />
                <ul>
                  {meal.ingredients.map((ingredient) => (
                    <li key={ingredient.inventory_item_id}>{formatNumber(ingredient.quantity)} {ingredient.unit} · {ingredient.name}</li>
                  ))}
                </ul>
                <CookSavedPlanMealButton
                  planId={plan.id}
                  mealType={meal.meal_type}
                  completed={Boolean(plan.completed_meals[meal.meal_type])}
                />
              </section>
            ))}
          </details>
        </article>
      ))}
    </section>
  );
}
