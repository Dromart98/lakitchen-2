import { convertFoodQuantity, isFoodQuantityUnit } from "@/modules/units/food-quantity";

export const NUTRITION_BASES = ["per_100g", "per_unit", "per_100ml"] as const;

export type InventoryNutritionBasis = (typeof NUTRITION_BASES)[number];

type InventoryNutritionValues = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

type InventoryAvailableNutritionInput = InventoryNutritionValues & {
  nutrition_basis: InventoryNutritionBasis | null;
  quantity: number;
  unit: string;
};

type InventoryConsumedNutritionInput = InventoryNutritionValues & {
  nutrition_basis: InventoryNutritionBasis | null;
  consumed_quantity: number;
  unit: string;
};

export type InventoryAvailableNutritionTotals = InventoryNutritionValues;

export const INVENTORY_NUTRITION_BASIS_LABELS: Record<InventoryNutritionBasis, string> = {
  per_100g: "Por 100 g",
  per_unit: "Por unidad",
  per_100ml: "Por 100 ml",
};

export function isInventoryNutritionBasis(value: unknown): value is InventoryNutritionBasis {
  return typeof value === "string" && NUTRITION_BASES.includes(value as InventoryNutritionBasis);
}

export function getInventoryNutritionBasisLabel(basis: InventoryNutritionBasis | null): string {
  return basis ? INVENTORY_NUTRITION_BASIS_LABELS[basis] : "Sin base nutricional";
}

export function parseOptionalInventoryNutritionNumber(value: unknown): number | null {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) return null;
  if (!/^\d+(?:\.\d+)?$/.test(rawValue)) return Number.NaN;

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
}

export function hasInventoryNutritionValues(values: Array<number | null>): boolean {
  return values.some((value) => value !== null);
}

export function hasCompleteInventoryNutritionValues(values: {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}): boolean {
  return [values.calories, values.protein_g, values.carbs_g, values.fat_g].every(
    (value) => value !== null && Number.isFinite(value) && value >= 0,
  );
}

function getAvailableNutritionFactor(
  nutritionBasis: InventoryNutritionBasis | null,
  quantity: number,
  unit: string,
) {
  if (!nutritionBasis || !isFoodQuantityUnit(unit)) {
    return null;
  }

  if (nutritionBasis === "per_100g") {
    const grams = convertFoodQuantity(quantity, unit, "g");
    return grams === null ? null : grams / 100;
  }

  if (nutritionBasis === "per_100ml") {
    const milliliters = convertFoodQuantity(quantity, unit, "ml");
    return milliliters === null ? null : milliliters / 100;
  }

  return convertFoodQuantity(quantity, unit, "ud");
}

function multiplyOptionalNutritionValue(value: number | null, factor: number) {
  return value === null ? null : value * factor;
}

function calculateInventoryNutritionForQuantity(
  input: InventoryNutritionValues & {
    nutrition_basis: InventoryNutritionBasis | null;
    quantity: number;
    unit: string;
  },
): InventoryAvailableNutritionTotals | null {
  const values = [input.calories, input.protein_g, input.carbs_g, input.fat_g];

  if (!hasInventoryNutritionValues(values)) return null;

  const factor = getAvailableNutritionFactor(input.nutrition_basis, input.quantity, input.unit);

  if (factor === null) return null;

  return {
    calories: multiplyOptionalNutritionValue(input.calories, factor),
    protein_g: multiplyOptionalNutritionValue(input.protein_g, factor),
    carbs_g: multiplyOptionalNutritionValue(input.carbs_g, factor),
    fat_g: multiplyOptionalNutritionValue(input.fat_g, factor),
  };
}

export function calculateAvailableInventoryNutrition(
  input: InventoryAvailableNutritionInput,
): InventoryAvailableNutritionTotals | null {
  return calculateInventoryNutritionForQuantity(input);
}

export function calculateConsumedInventoryNutrition(
  input: InventoryConsumedNutritionInput,
): InventoryAvailableNutritionTotals | null {
  return calculateInventoryNutritionForQuantity({
    nutrition_basis: input.nutrition_basis,
    quantity: input.consumed_quantity,
    unit: input.unit,
    calories: input.calories,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
  });
}

export function formatInventoryNutritionTotalValue(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;

  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
}
