"use client";

import { useId, useState } from "react";

import { calculateCookingYield, type CookingYieldResult } from "@/modules/recipes/cooking-yield";
import type { SavedRecipeCookingYieldNutrition } from "@/modules/recipes/saved-ai-recipe-cooking-yield";

type FieldName = "rawWeightG" | "cookedWeightG" | "servings";
type Fields = Record<FieldName, string>;

const INITIAL_FIELDS: Fields = { rawWeightG: "", cookedWeightG: "", servings: "" };

function parseDecimal(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits }).format(value);
}

function NutritionLine({ values }: { values: NonNullable<CookingYieldResult["nutritionTotal"]> }) {
  return <span>{formatNumber(values.calories)} kcal · {formatNumber(values.proteinG)} g proteínas · {formatNumber(values.carbsG)} g carbohidratos · {formatNumber(values.fatG)} g grasas</span>;
}

export function CookingYieldPreview({ recipeId, nutrition }: { recipeId: string; nutrition: SavedRecipeCookingYieldNutrition }) {
  const fieldId = useId();
  const [fields, setFields] = useState<Fields>(INITIAL_FIELDS);
  const [result, setResult] = useState<CookingYieldResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField(name: FieldName, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    setResult(null);
    setError(null);
  }

  function calculate() {
    const rawWeightG = parseDecimal(fields.rawWeightG);
    const cookedWeightG = parseDecimal(fields.cookedWeightG);
    const servings = parseDecimal(fields.servings);

    if (!fields.rawWeightG.trim() || !Number.isFinite(rawWeightG) || rawWeightG <= 0) {
      setError("Introduce un peso antes de cocinar mayor que cero.");
      return;
    }
    if (!fields.cookedWeightG.trim() || !Number.isFinite(cookedWeightG) || cookedWeightG <= 0) {
      setError("Introduce un peso final cocinado mayor que cero.");
      return;
    }
    if (!fields.servings.trim() || !Number.isSafeInteger(servings) || servings <= 0) {
      setError("Introduce un número entero de raciones mayor que cero.");
      return;
    }
    if (nutrition.status === "incomplete") return;

    try {
      setResult(calculateCookingYield({ rawWeightG, cookedWeightG, servings, resolvedNutritionTotal: nutrition.total }));
      setError(null);
    } catch {
      setResult(null);
      setError("Revisa los pesos y las raciones para poder calcular el rendimiento.");
    }
  }

  return (
    <details className="recipes-card__details cooking-yield-preview" data-recipe-id={recipeId}>
      <summary>Calcular rendimiento al cocinar</summary>
      {nutrition.status === "incomplete" ? (
        <p className="cooking-yield-preview__notice" role="status">
          No podemos calcular todavía la nutrición. Revisa la cantidad, la unidad y los datos nutricionales de {nutrition.itemsToReview === 1 ? "1 ingrediente" : `${nutrition.itemsToReview} ingredientes`} en tu inventario.
        </p>
      ) : (
        <div className="cooking-yield-preview__body">
          <p className="muted">Usa los pesos que observes. Esta previsualización no guarda ni modifica la receta.</p>
          <div className="cooking-yield-preview__fields">
            <label htmlFor={`${fieldId}-raw`}>Peso antes de cocinar (g)</label>
            <input id={`${fieldId}-raw`} inputMode="decimal" type="text" value={fields.rawWeightG} onChange={(event) => updateField("rawWeightG", event.target.value)} />
            <label htmlFor={`${fieldId}-cooked`}>Peso final cocinado (g)</label>
            <input id={`${fieldId}-cooked`} inputMode="decimal" type="text" value={fields.cookedWeightG} onChange={(event) => updateField("cookedWeightG", event.target.value)} />
            <label htmlFor={`${fieldId}-servings`}>Número de raciones</label>
            <input id={`${fieldId}-servings`} inputMode="numeric" type="text" value={fields.servings} onChange={(event) => updateField("servings", event.target.value)} />
          </div>
          <button type="button" onClick={calculate}>Ver previsualización</button>
          {error ? <p className="cooking-yield-preview__error" role="alert">{error}</p> : null}
          {result?.nutritionTotal && result.nutritionPerServing && result.nutritionPer100gCooked ? (
            <div className="cooking-yield-preview__result" aria-live="polite">
              <p><strong>Rendimiento</strong><span>{formatNumber(result.yieldFactor * 100, 2)} %</span></p>
              <p><strong>Peso cocinado por ración</strong><span>{formatNumber(result.cookedWeightPerServingG, 2)} g</span></p>
              <p><strong>Nutrición total</strong><NutritionLine values={result.nutritionTotal} /></p>
              <p><strong>Nutrición por ración</strong><NutritionLine values={result.nutritionPerServing} /></p>
              <p><strong>Nutrición por 100 g cocinados</strong><NutritionLine values={result.nutritionPer100gCooked} /></p>
            </div>
          ) : null}
        </div>
      )}
    </details>
  );
}
