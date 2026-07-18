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
    <p className="saved-plan__nutrition">
      {formatNumber(value.calories)} kcal · P {formatNumber(value.protein_g)} g · C {formatNumber(value.carbs_g)} g · G {formatNumber(value.fat_g)} g
    </p>
  );
}

export function SavedDailyPlans({ plans }: { plans: SavedDailyPlan[] }) {
  return (
    <section className="saved-plans" aria-labelledby="saved-plans-title">
      <div className="saved-plans__heading">
        <span className="plan-eyebrow">Tu colección</span>
        <h2 id="saved-plans-title">Tus planes guardados</h2>
        <p>Puedes registrar cada comida por separado. Solo entonces se descuentan sus ingredientes del inventario.</p>
      </div>

      {plans.length === 0 ? <p className="saved-plans__empty">Todavía no has guardado ningún plan.</p> : null}

      {plans.map((plan) => (
        <article className="saved-plan" key={plan.id}>
          <div className="saved-plan__header">
            <div className="saved-plan__identity">
              <span className="saved-plan__fit">{fitLabels[plan.fit]}</span>
              <h3>Plan del {formatDate(`${plan.plan_date}T12:00:00.000Z`)}</h3>
              <p>Guardado el {formatDate(plan.created_at)}</p>
              <MacroLine value={plan.total} />
              <p className="saved-plan__progress"><strong>{Object.values(plan.completed_meals).filter(Boolean).length} de 4</strong> comidas registradas</p>
            </div>
            <form className="saved-plan__delete" action={deleteSavedDailyPlanAction}>
              <input type="hidden" name="plan_id" value={plan.id} />
              <button type="submit">Eliminar plan</button>
            </form>
          </div>

          <details className="saved-plan__details">
            <summary>Ver las cuatro comidas</summary>
            <div className="saved-plan__meals">
              {plan.meals.map((meal) => (
                <section className="saved-plan-meal" key={meal.meal_type}>
                  <span className="saved-plan-meal__type">{MEAL_TYPE_LABELS[meal.meal_type]}</span>
                  <h4>{meal.title}</h4>
                  <p className="saved-plan-meal__description">{meal.description}</p>
                  <p className="saved-plan-meal__time"><strong>Tiempo:</strong> {meal.estimated_minutes} minutos</p>
                  <MacroLine value={meal.nutrition} />
                  <h5>Ingredientes</h5>
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
            </div>
          </details>
        </article>
      ))}
    </section>
  );
}
