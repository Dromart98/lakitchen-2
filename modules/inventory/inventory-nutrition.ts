export const NUTRITION_BASES = ["per_100g", "per_unit"] as const;

export type InventoryNutritionBasis = (typeof NUTRITION_BASES)[number];

type InventoryNutritionUnit = "ud" | "g" | "kg" | "ml" | "l";

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

function isInventoryNutritionUnit(value: string): value is InventoryNutritionUnit {
  return value === "ud" || value === "g" || value === "kg" || value === "ml" || value === "l";
}

function getAvailableNutritionFactor(
  nutritionBasis: InventoryNutritionBasis | null,
  quantity: number,
  unit: string,
) {
  if (!nutritionBasis || !Number.isFinite(quantity) || quantity <= 0 || !isInventoryNutritionUnit(unit)) {
    return null;
  }

  if (nutritionBasis === "per_100g") {
    if (unit === "g") return quantity / 100;
    if (unit === "kg") return quantity * 10;
    return null;
  }

  if (unit === "ud") return quantity;

  return null;
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
