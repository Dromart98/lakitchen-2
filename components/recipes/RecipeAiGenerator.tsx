"use client";

import { useState, useTransition } from "react";

import { cookGeneratedRecipeAndLogMealAction, generateRecipeAiSuggestionsAction } from "@/app/recipes/actions";
import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from "@/modules/meals/meal-types";
import type { RecipeAiActionResult } from "@/modules/recipes/recipe-ai-generation";

const generationErrorMessages: Record<string, string> = {
  unauthenticated: "Inicia sesión para generar recetas con tu inventario.",
  "empty-inventory": "Añade productos al inventario antes de generar recetas.",
  "insufficient-inventory": "Necesitas al menos dos productos disponibles para generar sugerencias útiles.",
  "missing-api-key": "La generación con IA no está configurada todavía.",
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
  const [result, setResult] = useState<RecipeAiActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cookingRecipeTitle, setCookingRecipeTitle] = useState<string | null>(null);
  const [selectedMealTypes, setSelectedMealTypes] = useState<Record<string, MealType>>({});
  const isBusy = isPending || cookingRecipeTitle !== null;

  function handleSubmit(formData: FormData) {
    setResult(null);
    setCookingRecipeTitle(null);
    startTransition(async () => {
      const nextResult = await generateRecipeAiSuggestionsAction({
        max_minutes: formData.get("max_minutes"),
        servings: formData.get("servings"),
        suggestion_count: formData.get("suggestion_count"),
        priority_mode: formData.get("priority_mode"),
      });
      setResult(nextResult);
      if (nextResult.status === "success") {
        setSelectedMealTypes(Object.fromEntries(nextResult.recipes.map((recipe) => [recipe.title, "lunch" as MealType])));
      }
    });
  }

  async function handleCook(recipe: Extract<RecipeAiActionResult, { status: "success" }>["recipes"][number]) {
    if (cookingRecipeTitle !== null || isPending || !recipe.nutrition.isComplete || !recipe.nutrition.total || !recipe.nutrition.perServing) return;

    setCookingRecipeTitle(recipe.title);
    const { nutrition: _nutrition, ...recipePayload } = recipe;
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
    };

    setResult({ status: "needs-clarification", message: messageByCode[cookResult.code] ?? "No se pudo cocinar y registrar la receta." });
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Generar recetas con IA</h2>
      <p className="muted">Crea sugerencias temporales usando únicamente productos disponibles en tu inventario. No se guardan ni descuentan cantidades.</p>
      <form action={handleSubmit}>
        <label htmlFor="recipe-ai-max-minutes">Tiempo máximo</label>
        <select id="recipe-ai-max-minutes" name="max_minutes" defaultValue="30" disabled={isBusy}>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="60">60 minutos</option>
        </select>

        <label htmlFor="recipe-ai-servings">Raciones</label>
        <select id="recipe-ai-servings" name="servings" defaultValue="2" disabled={isBusy}>
          <option value="1">1 ración</option>
          <option value="2">2 raciones</option>
          <option value="3">3 raciones</option>
          <option value="4">4 raciones</option>
        </select>

        <label htmlFor="recipe-ai-suggestion-count">Número de sugerencias</label>
        <select id="recipe-ai-suggestion-count" name="suggestion_count" defaultValue="2" disabled={isBusy}>
          <option value="1">1 sugerencia</option>
          <option value="2">2 sugerencias</option>
          <option value="3">3 sugerencias</option>
        </select>

        <label htmlFor="recipe-ai-priority-mode">Prioridad de las recetas</label>
        <select id="recipe-ai-priority-mode" name="priority_mode" defaultValue="balanced" disabled={isBusy}>
          <option value="balanced">Recetas equilibradas</option>
          <option value="expiration">Priorizar productos que caducan</option>
        </select>
        <p className="muted">El modo antidesperdicio prioriza productos que caducan en los próximos 7 días.</p>

        <button type="submit" disabled={isBusy}>Generar recetas</button>
      </form>

      {isPending ? <p role="status">Generando sugerencias…</p> : null}
      {cookingRecipeTitle ? <p role="status">Cocinando y registrando…</p> : null}

      {result?.status === "error" ? <p role="alert">{getErrorMessage(result)}</p> : null}
      {result?.status === "needs-clarification" ? <p role="status">{result.message}</p> : null}

      {result?.status === "success" ? (
        <div>
          <p className="muted">Sugerencias generadas por IA. Revísalas antes de cocinar; todavía no se pueden guardar ni descontar del inventario.</p>
          {result.recipes.map((recipe) => (
            <article className="card" key={recipe.title} style={{ marginTop: 16 }}>
              <p className="muted">Sugerencia generada por IA</p>
              <h3>{recipe.title}</h3>
              <p>{recipe.description}</p>
              <p>{recipe.estimated_minutes} minutos · {recipe.servings} ración{recipe.servings === 1 ? "" : "es"}</p>
              <h4>Ingredientes</h4>
              <ul>
                {recipe.ingredients.map((ingredient) => (
                  <li key={`${recipe.title}-${ingredient.inventory_item_id}`}>
                    {ingredient.name}: {ingredient.quantity} {ingredient.unit}
                  </li>
                ))}
              </ul>
              <h4>Preparación</h4>
              <ol>
                {recipe.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <section>
                <h4>Información nutricional estimada</h4>
                {recipe.nutrition.isComplete && recipe.nutrition.total && recipe.nutrition.perServing ? (
                  <>
                    <p>Total de la receta: {formatNutritionLine(recipe.nutrition.total)}</p>
                    <p>Por ración: {formatNutritionLine(recipe.nutrition.perServing)}</p>
                  </>
                ) : (
                  <p className="muted">{getMissingNutritionMessage(recipe.nutrition.missingNutritionItemCount)}</p>
                )}
              </section>
              <label htmlFor={`recipe-ai-meal-type-${recipe.title}`}>Tipo de comida</label>
              <select
                id={`recipe-ai-meal-type-${recipe.title}`}
                value={selectedMealTypes[recipe.title] ?? "lunch"}
                disabled={isBusy}
                onChange={(event) => setSelectedMealTypes((current) => ({ ...current, [recipe.title]: event.target.value as MealType }))}
              >
                {MEAL_TYPES.map((mealType) => (
                  <option key={mealType} value={mealType}>{MEAL_TYPE_LABELS[mealType]}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={isBusy || !recipe.nutrition.isComplete || !recipe.nutrition.total || !recipe.nutrition.perServing}
                onClick={() => { void handleCook(recipe); }}
              >
                {cookingRecipeTitle === recipe.title ? "Cocinando y registrando…" : "Cocinar y registrar"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
