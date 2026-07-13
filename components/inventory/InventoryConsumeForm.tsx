"use client";

import { useMemo, useState } from "react";

import { consumeInventoryItemAction, consumeInventoryItemAndLogMealAction } from "@/app/inventory/actions";
import {
  calculateConsumedInventoryNutrition,
  formatInventoryNutritionTotalValue,
  hasCompleteInventoryNutritionValues,
  hasInventoryNutritionValues,
} from "@/modules/inventory/inventory-nutrition";
import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import { MEAL_TYPE_LABELS, MEAL_TYPES } from "@/modules/meals/meal-types";

type InventoryConsumeFormProps = {
  id: string;
  quantity: number;
  unit: string;
  nutrition_basis: InventoryNutritionBasis | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

function formatOptionalPreviewValue(value: number | null, suffix: string) {
  const formattedValue = formatInventoryNutritionTotalValue(value);

  return formattedValue === null ? null : `${formattedValue} ${suffix}`;
}

function getPreviewParts(totals: {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}) {
  return [
    formatOptionalPreviewValue(totals.calories, "kcal"),
    formatOptionalPreviewValue(totals.protein_g, "g proteína"),
    formatOptionalPreviewValue(totals.carbs_g, "g carbohidratos"),
    formatOptionalPreviewValue(totals.fat_g, "g grasas"),
  ].filter((part): part is string => Boolean(part));
}

export function InventoryConsumeForm({
  id,
  quantity,
  unit,
  nutrition_basis,
  calories,
  protein_g,
  carbs_g,
  fat_g,
}: InventoryConsumeFormProps) {
  const [consumedQuantity, setConsumedQuantity] = useState("");
  const parsedQuantity = Number(consumedQuantity);
  const nutritionValues = { calories, protein_g, carbs_g, fat_g };
  const hasNutrition = hasInventoryNutritionValues([calories, protein_g, carbs_g, fat_g]);
  const hasCompleteNutrition = hasCompleteInventoryNutritionValues(nutritionValues);
  const isPositiveFiniteQuantity = consumedQuantity.trim() !== "" && Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const exceedsStock = isPositiveFiniteQuantity && parsedQuantity > quantity;
  const canCalculateWithUnit = hasNutrition && calculateConsumedInventoryNutrition({
    nutrition_basis,
    consumed_quantity: 1,
    unit,
    calories,
    protein_g,
    carbs_g,
    fat_g,
  }) !== null;
  const canLogMeal = hasCompleteNutrition && canCalculateWithUnit;

  const previewParts = useMemo(() => {
    if (!isPositiveFiniteQuantity || exceedsStock) return [];

    const totals = calculateConsumedInventoryNutrition({
      nutrition_basis,
      consumed_quantity: parsedQuantity,
      unit,
      calories,
      protein_g,
      carbs_g,
      fat_g,
    });

    return totals ? getPreviewParts(totals) : [];
  }, [calories, carbs_g, exceedsStock, fat_g, isPositiveFiniteQuantity, nutrition_basis, parsedQuantity, protein_g, unit]);

  return (
    <div className="meal-log-form">
      <form action={consumeInventoryItemAction} className="meal-log-form">
        <input name="id" type="hidden" value={id} />
        <label className="field" htmlFor={`inventory-consumed-quantity-${id}`}>
          <span>Cantidad consumida</span>
          <input
            id={`inventory-consumed-quantity-${id}`}
            name="consumed_quantity"
            type="number"
            min="0.000001"
            step="any"
            required
            value={consumedQuantity}
            onChange={(event) => setConsumedQuantity(event.target.value)}
          />
        </label>
        {exceedsStock ? <p className="muted">La cantidad supera el stock disponible.</p> : null}
        {previewParts.length ? (
          <p className="muted">
            Este consumo equivale a:
            <br />
            {previewParts.join(" · ")}
          </p>
        ) : null}
        {hasNutrition && !canCalculateWithUnit && !exceedsStock ? (
          <p className="muted">No se puede calcular la información nutricional de este consumo con la unidad actual.</p>
        ) : null}
        <button className="button" type="submit">Confirmar consumo</button>
      </form>

      <form action={consumeInventoryItemAndLogMealAction} className="meal-log-form">
        <input name="id" type="hidden" value={id} />
        <input name="consumed_quantity" type="hidden" value={consumedQuantity} />
        <label className="field" htmlFor={`inventory-consumed-meal-type-${id}`}>
          <span>Registrar como comida</span>
          <select id={`inventory-consumed-meal-type-${id}`} name="meal_type" required defaultValue="other">
            {MEAL_TYPES.map((mealType) => (
              <option key={mealType} value={mealType}>
                {MEAL_TYPE_LABELS[mealType]}
              </option>
            ))}
          </select>
        </label>
        {!hasCompleteNutrition ? (
          <p className="muted">Completa las calorías y todos los macros para registrar este consumo como comida.</p>
        ) : null}
        <button className="button" type="submit" disabled={!canLogMeal || exceedsStock || !isPositiveFiniteQuantity}>
          Consumir y registrar como comida
        </button>
      </form>
    </div>
  );
}
