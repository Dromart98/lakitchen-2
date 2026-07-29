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
  confirmedUnitMeasure?: {
    canonicalQuantity: number;
    canonicalUnit: "g" | "ml";
  } | null;
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
  confirmedUnitMeasure?: InventoryConsumedNutritionInput["confirmedUnitMeasure"],
): { factor: number; usedConfirmedUnitMeasure: boolean } | null {
  if (!nutritionBasis || !isFoodQuantityUnit(unit)) {
    return null;
  }

  if (nutritionBasis === "per_100g") {
    const grams = convertFoodQuantity(quantity, unit, "g");
    if (grams !== null) return { factor: grams / 100, usedConfirmedUnitMeasure: false };
    return unit === "ud"
      && confirmedUnitMeasure?.canonicalUnit === "g"
      && Number.isFinite(confirmedUnitMeasure.canonicalQuantity)
      && confirmedUnitMeasure.canonicalQuantity > 0
      ? { factor: quantity * confirmedUnitMeasure.canonicalQuantity / 100, usedConfirmedUnitMeasure: true }
      : null;
  }

  if (nutritionBasis === "per_100ml") {
    const milliliters = convertFoodQuantity(quantity, unit, "ml");
    if (milliliters !== null) return { factor: milliliters / 100, usedConfirmedUnitMeasure: false };
    return unit === "ud"
      && confirmedUnitMeasure?.canonicalUnit === "ml"
      && Number.isFinite(confirmedUnitMeasure.canonicalQuantity)
      && confirmedUnitMeasure.canonicalQuantity > 0
      ? { factor: quantity * confirmedUnitMeasure.canonicalQuantity / 100, usedConfirmedUnitMeasure: true }
      : null;
  }

  const units = convertFoodQuantity(quantity, unit, "ud");
  if (units !== null) return { factor: units, usedConfirmedUnitMeasure: false };
  if (
    !confirmedUnitMeasure
    || !Number.isFinite(confirmedUnitMeasure.canonicalQuantity)
    || confirmedUnitMeasure.canonicalQuantity <= 0
  ) return null;
  const canonicalQuantity = convertFoodQuantity(quantity, unit, confirmedUnitMeasure.canonicalUnit);
  return canonicalQuantity === null ? null : {
    factor: canonicalQuantity / confirmedUnitMeasure.canonicalQuantity,
    usedConfirmedUnitMeasure: true,
  };
}

function multiplyOptionalNutritionValue(value: number | null, factor: number) {
  return value === null ? null : value * factor;
}

function calculateInventoryNutritionForQuantityWithMetadata(
  input: InventoryNutritionValues & {
    nutrition_basis: InventoryNutritionBasis | null;
    quantity: number;
    unit: string;
    confirmedUnitMeasure?: InventoryConsumedNutritionInput["confirmedUnitMeasure"];
  },
): { nutrition: InventoryAvailableNutritionTotals; usedConfirmedUnitMeasure: boolean } | null {
  const values = [input.calories, input.protein_g, input.carbs_g, input.fat_g];

  if (!hasInventoryNutritionValues(values)) return null;

  const factorResult = getAvailableNutritionFactor(
    input.nutrition_basis,
    input.quantity,
    input.unit,
    input.confirmedUnitMeasure,
  );

  if (factorResult === null) return null;
  const { factor, usedConfirmedUnitMeasure } = factorResult;

  return {
    nutrition: {
      calories: multiplyOptionalNutritionValue(input.calories, factor),
      protein_g: multiplyOptionalNutritionValue(input.protein_g, factor),
      carbs_g: multiplyOptionalNutritionValue(input.carbs_g, factor),
      fat_g: multiplyOptionalNutritionValue(input.fat_g, factor),
    },
    usedConfirmedUnitMeasure,
  };
}

export function calculateAvailableInventoryNutrition(
  input: InventoryAvailableNutritionInput,
): InventoryAvailableNutritionTotals | null {
  return calculateInventoryNutritionForQuantityWithMetadata(input)?.nutrition ?? null;
}

export function calculateConsumedInventoryNutritionWithMetadata(
  input: InventoryConsumedNutritionInput,
): { nutrition: InventoryAvailableNutritionTotals; usedConfirmedUnitMeasure: boolean } | null {
  return calculateInventoryNutritionForQuantityWithMetadata({
    nutrition_basis: input.nutrition_basis,
    quantity: input.consumed_quantity,
    unit: input.unit,
    calories: input.calories,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
    confirmedUnitMeasure: input.confirmedUnitMeasure,
  });
}

export function calculateConsumedInventoryNutrition(
  input: InventoryConsumedNutritionInput,
): InventoryAvailableNutritionTotals | null {
  return calculateConsumedInventoryNutritionWithMetadata(input)?.nutrition ?? null;
}

export function formatInventoryNutritionTotalValue(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;

  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
}
