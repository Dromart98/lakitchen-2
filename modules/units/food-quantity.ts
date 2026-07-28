export const FOOD_QUANTITY_UNITS = ["g", "kg", "ml", "l", "ud"] as const;

export type FoodQuantityUnit = (typeof FOOD_QUANTITY_UNITS)[number];
export type FoodQuantityDimension = "mass" | "volume" | "units";
export type CanonicalFoodQuantityUnit = "g" | "ml" | "ud";

export type FoodQuantityUnitDefinition = Readonly<{
  dimension: FoodQuantityDimension;
  canonicalUnit: CanonicalFoodQuantityUnit;
  factor: number;
}>;

export const FOOD_QUANTITY_UNIT_DEFINITIONS: Readonly<Record<FoodQuantityUnit, FoodQuantityUnitDefinition>> =
  Object.freeze({
    g: Object.freeze({ dimension: "mass", canonicalUnit: "g", factor: 1 }),
    kg: Object.freeze({ dimension: "mass", canonicalUnit: "g", factor: 1000 }),
    ml: Object.freeze({ dimension: "volume", canonicalUnit: "ml", factor: 1 }),
    l: Object.freeze({ dimension: "volume", canonicalUnit: "ml", factor: 1000 }),
    ud: Object.freeze({ dimension: "units", canonicalUnit: "ud", factor: 1 }),
  });

export function isFoodQuantityUnit(value: unknown): value is FoodQuantityUnit {
  return typeof value === "string" && Object.hasOwn(FOOD_QUANTITY_UNIT_DEFINITIONS, value);
}

export function getFoodQuantityUnitDefinition(value: unknown): FoodQuantityUnitDefinition | null {
  return isFoodQuantityUnit(value) ? FOOD_QUANTITY_UNIT_DEFINITIONS[value] : null;
}

export function areFoodQuantityUnitsCompatible(firstUnit: unknown, secondUnit: unknown): boolean {
  const first = getFoodQuantityUnitDefinition(firstUnit);
  const second = getFoodQuantityUnitDefinition(secondUnit);
  return Boolean(first && second && first.dimension === second.dimension);
}

export function convertFoodQuantity(quantity: number, fromUnit: unknown, toUnit: unknown): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const source = getFoodQuantityUnitDefinition(fromUnit);
  const target = getFoodQuantityUnitDefinition(toUnit);
  if (!source || !target || source.dimension !== target.dimension) return null;
  return quantity * source.factor / target.factor;
}

export function convertFoodQuantityToCanonical(
  quantity: number,
  unit: unknown,
): { quantity: number; unit: CanonicalFoodQuantityUnit } | null {
  const definition = getFoodQuantityUnitDefinition(unit);
  if (!definition) return null;
  const convertedQuantity = convertFoodQuantity(quantity, unit, definition.canonicalUnit);
  return convertedQuantity === null ? null : { quantity: convertedQuantity, unit: definition.canonicalUnit };
}
