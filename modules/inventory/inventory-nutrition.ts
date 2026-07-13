export const NUTRITION_BASES = ["per_100g", "per_unit"] as const;

export type InventoryNutritionBasis = (typeof NUTRITION_BASES)[number];

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
