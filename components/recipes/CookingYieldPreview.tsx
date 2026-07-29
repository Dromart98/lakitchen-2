"use client";

import { useId, useState, useTransition } from "react";

import { deleteSavedRecipeCookingYieldAction, saveSavedRecipeCookingYieldAction } from "@/app/recipes/actions";
import { calculateCookingYield, type CookingYieldResult } from "@/modules/recipes/cooking-yield";
import type { SavedRecipeCookingYieldNutrition } from "@/modules/recipes/saved-ai-recipe-cooking-yield";
import type { SavedRecipeCookingYieldMeasurement } from "@/modules/recipes/saved-ai-recipe-cooking-yield-measurement";

type FieldName = "rawWeightG" | "cookedWeightG" | "servings";
type Fields = Record<FieldName, string>;
type PendingOperation = "save" | "delete" | null;

function fieldsFromMeasurement(measurement: SavedRecipeCookingYieldMeasurement | null): Fields {
  return measurement ? { rawWeightG: String(measurement.rawWeightG), cookedWeightG: String(measurement.cookedWeightG), servings: String(measurement.servings) } : { rawWeightG: "", cookedWeightG: "", servings: "" };
}

function parseDecimal(value: string): number { return Number(value.trim().replace(",", ".")); }
function formatNumber(value: number, maximumFractionDigits = 1): string { return new Intl.NumberFormat("es-ES", { maximumFractionDigits }).format(value); }

function NutritionLine({ values }: { values: NonNullable<CookingYieldResult["nutritionTotal"]> }) {
  return <span>{formatNumber(values.calories)} kcal · {formatNumber(values.proteinG)} g proteínas · {formatNumber(values.carbsG)} g carbohidratos · {formatNumber(values.fatG)} g grasas</span>;
}

function calculateResult(measurement: SavedRecipeCookingYieldMeasurement | null, nutrition: SavedRecipeCookingYieldNutrition): CookingYieldResult | null {
  if (!measurement || nutrition.status === "incomplete") return null;
  return calculateCookingYield({ ...measurement, resolvedNutritionTotal: nutrition.total });
}

export function CookingYieldPreview({ recipeId, nutrition, initialMeasurement }: { recipeId: string; nutrition: SavedRecipeCookingYieldNutrition; initialMeasurement: SavedRecipeCookingYieldMeasurement | null }) {
  const fieldId = useId();
  const [fields, setFields] = useState<Fields>(() => fieldsFromMeasurement(initialMeasurement));
  const [savedMeasurement, setSavedMeasurement] = useState(initialMeasurement);
  const [result, setResult] = useState<CookingYieldResult | null>(() => calculateResult(initialMeasurement, nutrition));
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation>(null);
  const [pending, startTransition] = useTransition();

  function measurementFromFields(): SavedRecipeCookingYieldMeasurement | null {
    const rawWeightG = parseDecimal(fields.rawWeightG);
    const cookedWeightG = parseDecimal(fields.cookedWeightG);
    const servings = parseDecimal(fields.servings);
    if (!fields.rawWeightG.trim() || !Number.isFinite(rawWeightG) || rawWeightG <= 0) { setMessage({ kind: "error", text: "Introduce un peso antes de cocinar mayor que cero." }); return null; }
    if (!fields.cookedWeightG.trim() || !Number.isFinite(cookedWeightG) || cookedWeightG <= 0) { setMessage({ kind: "error", text: "Introduce un peso final cocinado mayor que cero." }); return null; }
    if (!fields.servings.trim() || !Number.isSafeInteger(servings) || servings <= 0) { setMessage({ kind: "error", text: "Introduce un número entero de raciones mayor que cero." }); return null; }
    return { rawWeightG, cookedWeightG, servings };
  }

  function updateField(name: FieldName, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    setResult(null);
    setMessage(null);
    setConfirmingDelete(false);
  }

  function preview() {
    const measurement = measurementFromFields();
    if (!measurement || nutrition.status === "incomplete") return;
    setResult(calculateResult(measurement, nutrition));
    setMessage(null);
  }

  function save() {
    const measurement = measurementFromFields();
    if (!measurement) return;
    setConfirmingDelete(false);
    setPendingOperation("save");
    startTransition(async () => {
      try {
        const response = await saveSavedRecipeCookingYieldAction({ recipeId, ...measurement });
        if (response.status === "error") { setMessage({ kind: "error", text: response.code === "unauthenticated" ? "Tu sesión ha caducado. Vuelve a iniciar sesión para guardar la medición." : response.code === "recipe-not-found" ? "La receta ya no está disponible." : response.code === "invalid-input" ? "Revisa los pesos y las raciones antes de guardar." : "No se pudo guardar la medición. Inténtalo de nuevo." }); return; }
        setSavedMeasurement(measurement);
        setResult(calculateResult(measurement, nutrition));
        setMessage({ kind: "success", text: response.code === "saved" ? "Medición guardada." : "Medición corregida y guardada." });
      } finally {
        setPendingOperation(null);
      }
    });
  }

  function remove() {
    setPendingOperation("delete");
    startTransition(async () => {
      try {
        const response = await deleteSavedRecipeCookingYieldAction(recipeId);
        if (response.status === "error") { setMessage({ kind: "error", text: "No se pudo eliminar la medición. Inténtalo de nuevo." }); return; }
        setSavedMeasurement(null);
        setFields(fieldsFromMeasurement(null));
        setResult(null);
        setConfirmingDelete(false);
        setMessage({ kind: "success", text: "Medición eliminada." });
      } finally {
        setPendingOperation(null);
      }
    });
  }

  return (
    <details className="recipes-card__details cooking-yield-preview" data-recipe-id={recipeId}>
      <summary>Rendimiento al cocinar</summary>
      <div className="cooking-yield-preview__body">
        <p className="muted">Guarda los pesos y las raciones que observes. Puedes corregirlos cuando vuelvas a preparar la receta.</p>
        {nutrition.status === "incomplete" ? <p className="cooking-yield-preview__notice" role="status">Conservamos tu medición, pero no mostraremos resultados hasta que revises la cantidad, la unidad y la nutrición de {nutrition.itemsToReview === 1 ? "1 ingrediente" : `${nutrition.itemsToReview} ingredientes`} en tu inventario.</p> : null}
        <div className="cooking-yield-preview__fields">
          <label htmlFor={`${fieldId}-raw`}>Peso antes de cocinar (g)</label><input id={`${fieldId}-raw`} inputMode="decimal" type="text" value={fields.rawWeightG} onChange={(event) => updateField("rawWeightG", event.target.value)} />
          <label htmlFor={`${fieldId}-cooked`}>Peso final cocinado (g)</label><input id={`${fieldId}-cooked`} inputMode="decimal" type="text" value={fields.cookedWeightG} onChange={(event) => updateField("cookedWeightG", event.target.value)} />
          <label htmlFor={`${fieldId}-servings`}>Número de raciones</label><input id={`${fieldId}-servings`} inputMode="numeric" type="text" value={fields.servings} onChange={(event) => updateField("servings", event.target.value)} />
        </div>
        <div className="cooking-yield-preview__actions">
          <button type="button" disabled={pending || nutrition.status === "incomplete"} onClick={preview}>Ver previsualización</button>
          <button type="button" disabled={pending} onClick={save}>{pendingOperation === "save" ? "Guardando…" : savedMeasurement ? "Guardar corrección" : "Guardar medición"}</button>
          {savedMeasurement && !confirmingDelete ? <button type="button" disabled={pending} onClick={() => { setConfirmingDelete(true); setMessage(null); }}>Eliminar medición</button> : null}
          {savedMeasurement && confirmingDelete ? (
            <div className="cooking-yield-preview__delete-confirmation" role="group" aria-labelledby={`${fieldId}-delete-confirmation`}>
              <p id={`${fieldId}-delete-confirmation`}>¿Eliminar esta medición guardada? Esta acción no se puede deshacer.</p>
              <button type="button" disabled={pending} onClick={remove}>{pendingOperation === "delete" ? "Eliminando…" : "Confirmar eliminación"}</button>
              <button type="button" disabled={pending} onClick={() => setConfirmingDelete(false)}>Cancelar</button>
            </div>
          ) : null}
        </div>
        {message ? <p className={`cooking-yield-preview__${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
        {result?.nutritionTotal && result.nutritionPerServing && result.nutritionPer100gCooked ? <div className="cooking-yield-preview__result" aria-live="polite">
          <p><strong>Rendimiento</strong><span>{formatNumber(result.yieldFactor * 100, 2)} %</span></p><p><strong>Peso cocinado por ración</strong><span>{formatNumber(result.cookedWeightPerServingG, 2)} g</span></p><p><strong>Nutrición total</strong><NutritionLine values={result.nutritionTotal} /></p><p><strong>Nutrición por ración</strong><NutritionLine values={result.nutritionPerServing} /></p><p><strong>Nutrición por 100 g cocinados</strong><NutritionLine values={result.nutritionPer100gCooked} /></p>
        </div> : null}
      </div>
    </details>
  );
}
