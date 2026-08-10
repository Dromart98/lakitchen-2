"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { cookGeneratedRecipeAndLogMealAction, generateRecipeAiSuggestionsAction, saveGeneratedRecipeAction } from "@/app/recipes/actions";
import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from "@/modules/meals/meal-types";
import type { RecipeAiActionResult } from "@/modules/recipes/recipe-ai-generation";

const generationErrorMessages: Record<string, string> = {
  unauthenticated: "Inicia sesión para generar recetas con tu inventario.",
  "empty-inventory": "Añade productos al inventario antes de generar recetas.",
  "insufficient-inventory": "Necesitas al menos dos productos disponibles para generar sugerencias útiles.",
  "missing-api-key": "La generación con IA no está configurada todavía.",
  "daily-ai-limit": "Has alcanzado el límite de funciones con IA de hoy. Podrás volver a usarlas mañana.",
  "ai-access-unavailable": "Las funciones con IA no están disponibles ahora. Inténtalo más tarde.",
  "ai-feature-disabled": "Esta función no está disponible.",
  timeout: "La generación ha tardado demasiado. Inténtalo de nuevo en unos minutos.",
  "network-error": "No se pudo conectar con el proveedor de IA. Inténtalo de nuevo.",
  "http-timeout": "El proveedor de IA agotó el tiempo de respuesta. Inténtalo de nuevo.",
  "rate-limited": "Hay demasiadas solicitudes en este momento. Inténtalo más tarde.",
  "provider-error": "El proveedor de IA no pudo generar recetas ahora mismo.",
  "incomplete-response": "La IA devolvió una respuesta incompleta. Prueba con menos sugerencias.",
  refusal: "La IA no pudo generar una respuesta útil con esos datos.",
  "invalid-json": "La IA devolvió una respuesta que no se pudo leer de forma segura.",
  "invalid-ai-response": "La IA propuso una receta que no cumple las reglas de tu inventario.",
  "invalid-input": "Selecciona valores válidos para generar recetas.",
  "unexpected-error": "No se pudo generar recetas en este momento.",
};


function formatNutritionValue(value: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function formatNutritionLine(values: NonNullable<Extract<RecipeAiActionResult, { status: "success" }>["recipes"][number]["nutrition"]["total"]>): string {
  return `${formatNutritionValue(values.calories)} kcal · ${formatNutritionValue(values.proteinG)} g proteínas · ${formatNutritionValue(values.carbsG)} g carbohidratos · ${formatNutritionValue(values.fatG)} g grasas`;
}

function getMissingNutritionMessage(count: number): string {
  return `No se puede calcular la nutrición completa porque faltan datos nutricionales de ${count} producto${count === 1 ? "" : "s"}.`;
}

function getErrorMessage(result: Extract<RecipeAiActionResult, { status: "error" }>) {
  return generationErrorMessages[result.code] ?? generationErrorMessages["unexpected-error"];
}

export function RecipeAiGenerator() {
  const router = useRouter();
  const [result, setResult] = useState<RecipeAiActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cookingRecipeTitle, setCookingRecipeTitle] = useState<string | null>(null);
  const [selectedMealTypes, setSelectedMealTypes] = useState<Record<string, MealType>>({});
  const [lastPriorityMode, setLastPriorityMode] = useState<"balanced" | "expiration">("balanced");
  const [savingRecipeTitle, setSavingRecipeTitle] = useState<string | null>(null);
  const [saveMessages, setSaveMessages] = useState<Record<string, string>>({});
  const isBusy = isPending || cookingRecipeTitle !== null || savingRecipeTitle !== null;

  function handleSubmit(formData: FormData) {
    setResult(null);
    setCookingRecipeTitle(null);
    setSavingRecipeTitle(null);
    setSaveMessages({});
    startTransition(async () => {
      const priorityMode = formData.get("priority_mode") === "expiration" ? "expiration" : "balanced";
      setLastPriorityMode(priorityMode);
      const nextResult = await generateRecipeAiSuggestionsAction({
        max_minutes: formData.get("max_minutes"),
        servings: formData.get("servings"),
        suggestion_count: formData.get("suggestion_count"),
        priority_mode: priorityMode,
      });
      setResult(nextResult);
      if (nextResult.status === "success") {
        setSelectedMealTypes(Object.fromEntries(nextResult.recipes.map((recipe) => [recipe.title, "lunch" as MealType])));
      }
    });
  }

  async function handleSave(recipe: Extract<RecipeAiActionResult, { status: "success" }>["recipes"][number]) {
    if (savingRecipeTitle !== null || isPending) return;

    setSavingRecipeTitle(recipe.title);
    const { nutrition: _nutrition, calorieValidation: _calorieValidation, ...recipePayload } = recipe;
    const saveResult = await saveGeneratedRecipeAction({
      priority_mode: lastPriorityMode,
      recipe: recipePayload,
    });

    setSavingRecipeTitle(null);

    if (saveResult.status === "success") {
      setSaveMessages((current) => ({
        ...current,
        [recipe.title]: saveResult.code === "already-saved" ? "Ya estaba guardada" : "Receta guardada",
      }));
      router.refresh();
      return;
    }

    setSaveMessages((current) => ({ ...current, [recipe.title]: "No se pudo guardar la receta." }));
  }

  async function handleCook(recipe: Extract<RecipeAiActionResult, { status: "success" }>["recipes"][number]) {
    if (cookingRecipeTitle !== null || isPending || !recipe.nutrition.isComplete || !recipe.nutrition.total || !recipe.nutrition.perServing) return;

    setCookingRecipeTitle(recipe.title);
    const { nutrition: _nutrition, calorieValidation: _calorieValidation, ...recipePayload } = recipe;
    const cookResult = await cookGeneratedRecipeAndLogMealAction({
      meal_type: selectedMealTypes[recipe.title] ?? "lunch",
      recipe: recipePayload,
    });

    setCookingRecipeTitle(null);

    if (cookResult.status === "success") {
      setResult({ status: "needs-clarification", message: "Receta cocinada y comida registrada correctamente." });
      setSelectedMealTypes({});
      return;
    }

    const messageByCode: Record<string, string> = {
      "recipe-stale": "El inventario ha cambiado. Genera nuevas recetas.",
      "insufficient-stock": "Ya no hay suficiente cantidad de algún producto.",
      "expired-item": "La receta contiene un producto caducado.",
      "incomplete-nutrition": "Completa los datos nutricionales del inventario antes de cocinar y registrar esta receta.",
      "calorie-budget-exceeded": "Esta receta supera las calorías que te quedan hoy. Genera otra opción.",
      "equivalence-conflict": "La medida habitual cambió mientras preparábamos la receta. Revísala y vuelve a intentarlo.",
    };

    setResult({ status: "needs-clarification", message: messageByCode[cookResult.code] ?? "No se pudo cocinar y registrar la receta." });
  }

  return (
    <section className="recipe-ai" aria-labelledby="recipe-ai-title">
      <div className="recipes-section__heading">
        <div>
          <p className="recipes-eyebrow">Asistente IA</p>
          <h2 id="recipe-ai-title">Genera recetas para hoy</h2>
          <p>Crea sugerencias temporales usando únicamente productos disponibles en tu inventario. Las recetas generadas son temporales hasta que pulses “Guardar receta”. Cocinarlas seguirá descontando los ingredientes del inventario.</p>
        </div>
      </div>
      <form className="recipe-ai__form" action={handleSubmit}>
        <div className="recipe-ai__field">
          <label htmlFor="recipe-ai-max-minutes">Tiempo máximo</label>
          <select id="recipe-ai-max-minutes" name="max_minutes" defaultValue="30" disabled={isBusy}>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="60">60 minutos</option>
          </select>
        </div>

        <div className="recipe-ai__field">
          <label htmlFor="recipe-ai-servings">Raciones</label>
          <select id="recipe-ai-servings" name="servings" defaultValue="2" disabled={isBusy}>
          <option value="1">1 ración</option>
          <option value="2">2 raciones</option>
          <option value="3">3 raciones</option>
          <option value="4">4 raciones</option>
          </select>
        </div>

        <div className="recipe-ai__field">
          <label htmlFor="recipe-ai-suggestion-count">Número de sugerencias</label>
          <select id="recipe-ai-suggestion-count" name="suggestion_count" defaultValue="2" disabled={isBusy}>
          <option value="1">1 sugerencia</option>
          <option value="2">2 sugerencias</option>
          <option value="3">3 sugerencias</option>
          </select>
        </div>

        <div className="recipe-ai__field">
          <label htmlFor="recipe-ai-priority-mode">Prioridad de las recetas</label>
          <select id="recipe-ai-priority-mode" name="priority_mode" defaultValue="balanced" disabled={isBusy}>
          <option value="balanced">Recetas equilibradas</option>
          <option value="expiration">Priorizar productos que caducan</option>
          </select>
        </div>
        <p className="recipe-ai__hint">El modo antidesperdicio prioriza productos que caducan en los próximos 7 días.</p>

        <button type="submit" disabled={isBusy}>Generar recetas</button>
      </form>

      <div className="recipe-ai__status">
        {isPending ? <p role="status">Generando sugerencias…</p> : null}
        {cookingRecipeTitle ? <p role="status">Cocinando y registrando…</p> : null}
        {savingRecipeTitle ? <p role="status">Guardando…</p> : null}
        {result?.status === "error" ? <p className="recipe-ai__error" role="alert">{getErrorMessage(result)}</p> : null}
        {result?.status === "needs-clarification" ? <p role="status">{result.message}</p> : null}
      </div>

      {result?.status === "success" ? (
        <div className="recipe-ai__results">
          <p className="recipe-ai__temporary-note">Las recetas generadas son temporales hasta que pulses “Guardar receta”. Cocinarlas seguirá descontando los ingredientes del inventario.</p>
          {result.recipes.map((recipe) => (
            <article className="recipe-ai__card" key={recipe.title}>
              <p className="recipes-eyebrow">Sugerencia generada por IA</p>
              <h3>{recipe.title}</h3>
              <p>{recipe.description}</p>
              <p className="recipes-card__meta">{recipe.estimated_minutes} minutos · {recipe.servings} ración{recipe.servings === 1 ? "" : "es"}</p>
              {recipe.calorieValidation?.remainingCalories !== null && recipe.calorieValidation ? <p className="muted">Te quedan {formatNutritionValue(recipe.calorieValidation.remainingCalories)} kcal hoy.</p> : <p className="muted">No podemos validar esta receta contra un objetivo diario hasta que completes tu perfil nutricional.</p>}
              {recipe.calorieValidation?.status === "adjusted" ? <p className="recipe-ai__error" role="status">Esta receta supera las calorías que te quedan hoy. Hemos ajustado la ración o puedes generar otra opción.</p> : null}
              <details className="recipes-card__details">
                <summary>Ingredientes</summary>
                <ul>{recipe.ingredients.map((ingredient) => (
                  <li key={`${recipe.title}-${ingredient.inventory_item_id}`}>{ingredient.name}: {ingredient.quantity} {ingredient.unit}</li>
                ))}</ul>
              </details>
              <details className="recipes-card__details">
                <summary>Preparación</summary>
                <ol>{recipe.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </details>
              <section className="recipes-card__nutrition">
                <h4>Información nutricional estimada</h4>
                {recipe.nutrition.isComplete && recipe.nutrition.total && recipe.nutrition.perServing ? (
                  <div className="recipe-ai__nutrition-grid">
                    <p><strong>Total de la receta</strong><span>{formatNutritionLine(recipe.nutrition.total)}</span></p>
                    <p><strong>Por ración</strong><span>{formatNutritionLine(recipe.nutrition.perServing)}</span></p>
                  </div>
                ) : (
                  <p className="muted">{getMissingNutritionMessage(recipe.nutrition.missingNutritionItemCount)}</p>
                )}
                {recipe.nutrition.usedConfirmedUnitMeasure ? (
                  <p className="muted">Se ha usado una medida habitual guardada para calcular la nutrición. <Link href="/inventory/equivalences">Revisar medidas habituales</Link></p>
                ) : null}
              </section>
              <div className="recipe-ai__card-controls">
                <label htmlFor={`recipe-ai-meal-type-${recipe.title}`}>Tipo de comida</label>
                <select id={`recipe-ai-meal-type-${recipe.title}`} value={selectedMealTypes[recipe.title] ?? "lunch"} disabled={isBusy} onChange={(event) => setSelectedMealTypes((current) => ({ ...current, [recipe.title]: event.target.value as MealType }))}>
                  {MEAL_TYPES.map((mealType) => <option key={mealType} value={mealType}>{MEAL_TYPE_LABELS[mealType]}</option>)}
                </select>
                <p role="status">{saveMessages[recipe.title] ?? ""}</p>
              </div>
              <div className="recipes-card__actions">
                <button
                type="button"
                disabled={isBusy}
                onClick={() => { void handleSave(recipe); }}
              >
                {savingRecipeTitle === recipe.title ? "Guardando…" : "Guardar receta"}
                </button>
                <button
                type="button"
                disabled={isBusy || !recipe.nutrition.isComplete || !recipe.nutrition.total || !recipe.nutrition.perServing}
                onClick={() => { void handleCook(recipe); }}
              >
                {cookingRecipeTitle === recipe.title ? "Cocinando y registrando…" : "Cocinar y registrar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
