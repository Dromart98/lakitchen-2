"use client";

import { useState, useTransition } from "react";

import { generateRecipeAiSuggestionsAction } from "@/app/recipes/actions";
import type { RecipeAiGenerationResult } from "@/modules/recipes/recipe-ai-generation";

const errorMessages: Record<string, string> = {
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

function getErrorMessage(result: Extract<RecipeAiGenerationResult, { status: "error" }>) {
  return errorMessages[result.code] ?? errorMessages["unexpected-error"];
}

export function RecipeAiGenerator() {
  const [result, setResult] = useState<RecipeAiGenerationResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const nextResult = await generateRecipeAiSuggestionsAction({
        max_minutes: formData.get("max_minutes"),
        servings: formData.get("servings"),
        suggestion_count: formData.get("suggestion_count"),
      });
      setResult(nextResult);
    });
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Generar recetas con IA</h2>
      <p className="muted">Crea sugerencias temporales usando únicamente productos disponibles en tu inventario. No se guardan ni descuentan cantidades.</p>
      <form action={handleSubmit}>
        <label htmlFor="recipe-ai-max-minutes">Tiempo máximo</label>
        <select id="recipe-ai-max-minutes" name="max_minutes" defaultValue="30" disabled={isPending}>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="60">60 minutos</option>
        </select>

        <label htmlFor="recipe-ai-servings">Raciones</label>
        <select id="recipe-ai-servings" name="servings" defaultValue="2" disabled={isPending}>
          <option value="1">1 ración</option>
          <option value="2">2 raciones</option>
          <option value="3">3 raciones</option>
          <option value="4">4 raciones</option>
        </select>

        <label htmlFor="recipe-ai-suggestion-count">Número de sugerencias</label>
        <select id="recipe-ai-suggestion-count" name="suggestion_count" defaultValue="2" disabled={isPending}>
          <option value="1">1 sugerencia</option>
          <option value="2">2 sugerencias</option>
          <option value="3">3 sugerencias</option>
        </select>

        <button type="submit" disabled={isPending}>Generar recetas</button>
      </form>

      {isPending ? <p role="status">Generando sugerencias…</p> : null}

      {result?.status === "error" ? <p role="alert">{getErrorMessage(result)}</p> : null}
      {result?.status === "needs-clarification" ? <p role="status">La IA necesita aclaración: {result.message}</p> : null}

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
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
