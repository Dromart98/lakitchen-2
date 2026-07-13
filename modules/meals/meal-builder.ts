import {
  calculateConsumedInventoryNutrition,
  hasCompleteInventoryNutritionValues,
  type InventoryNutritionBasis,
  type InventoryAvailableNutritionTotals,
} from "@/modules/inventory/inventory-nutrition";

export type MealBuilderInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  nutrition_basis: InventoryNutritionBasis | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type MealBuilderLine = MealBuilderInventoryItem & {
  consumed_quantity: number;
};

export type MealBuilderTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function hasFiniteTotals(totals: InventoryAvailableNutritionTotals | null): totals is MealBuilderTotals {
  return Boolean(
    totals &&
      totals.calories !== null &&
      totals.protein_g !== null &&
      totals.carbs_g !== null &&
      totals.fat_g !== null &&
      Number.isFinite(totals.calories) &&
      Number.isFinite(totals.protein_g) &&
      Number.isFinite(totals.carbs_g) &&
      Number.isFinite(totals.fat_g),
  );
}

export function calculateMealBuilderLineNutrition(line: MealBuilderLine): MealBuilderTotals | null {
  if (!hasCompleteInventoryNutritionValues(line)) return null;
  if (!Number.isFinite(line.consumed_quantity) || line.consumed_quantity <= 0) return null;
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return null;
  if (line.consumed_quantity > line.quantity) return null;

  const totals = calculateConsumedInventoryNutrition(line);

  return hasFiniteTotals(totals) ? totals : null;
}

export function isMealBuilderInventoryItemEligible(item: MealBuilderInventoryItem): boolean {
  if (!item.nutrition_basis) return false;
  if (!hasCompleteInventoryNutritionValues(item)) return false;

  return calculateConsumedInventoryNutrition({
    ...item,
    consumed_quantity: 1,
  }) !== null;
}

export function calculateMealBuilderTotals(lines: MealBuilderLine[]): MealBuilderTotals | null {
  if (!lines.length) return null;

  const seenItemIds = new Set<string>();
  const totals: MealBuilderTotals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };

  for (const line of lines) {
    if (seenItemIds.has(line.id)) return null;
    seenItemIds.add(line.id);

    const lineTotals = calculateMealBuilderLineNutrition(line);

    if (!lineTotals) return null;

    totals.calories += lineTotals.calories;
    totals.protein_g += lineTotals.protein_g;
    totals.carbs_g += lineTotals.carbs_g;
    totals.fat_g += lineTotals.fat_g;
  }

  return totals;
}

export function formatMealBuilderNutritionValue(value: number): string | null {
  if (!Number.isFinite(value)) return null;

  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
}
