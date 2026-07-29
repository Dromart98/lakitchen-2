import type { NutritionTotals } from "@/modules/recipes/recipe-nutrition";

export type ExplicitIncorporatedOil = Readonly<{
  weightG: number;
  nutritionTotal?: Readonly<NutritionTotals>;
}>;

export type CookingYieldInput = Readonly<{
  rawWeightG: number;
  cookedWeightG: number;
  servings: number;
  resolvedNutritionTotal: Readonly<NutritionTotals>;
  netWaterChangeG?: number;
  incorporatedOil?: ExplicitIncorporatedOil;
}>;

export type CookingYieldResult = Readonly<{
  rawWeightG: number;
  cookedWeightG: number;
  servings: number;
  netWaterChangeG: number | null;
  incorporatedOil: ExplicitIncorporatedOil | null;
  yieldFactor: number;
  cookedWeightPerServingG: number;
  nutritionTotal: Readonly<NutritionTotals>;
  nutritionPerServing: Readonly<NutritionTotals>;
  nutritionPer100gCooked: Readonly<NutritionTotals>;
}>;

const NUTRIENT_KEYS = ["calories", "proteinG", "carbsG", "fatG"] as const;

function requirePositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function requireNutritionTotals(nutrition: Readonly<NutritionTotals>, name: string): void {
  for (const key of NUTRIENT_KEYS) {
    const value = nutrition[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name}.${key} must be a non-negative finite number`);
    }
  }
}

function mapNutrition(
  nutrition: Readonly<NutritionTotals>,
  divisor: number,
): Readonly<NutritionTotals> {
  return Object.freeze({
    calories: nutrition.calories / divisor,
    proteinG: nutrition.proteinG / divisor,
    carbsG: nutrition.carbsG / divisor,
    fatG: nutrition.fatG / divisor,
  });
}

function addNutrition(
  resolved: Readonly<NutritionTotals>,
  added?: Readonly<NutritionTotals>,
): Readonly<NutritionTotals> {
  if (!added) return Object.freeze({ ...resolved });

  return Object.freeze({
    calories: resolved.calories + added.calories,
    proteinG: resolved.proteinG + added.proteinG,
    carbsG: resolved.carbsG + added.carbsG,
    fatG: resolved.fatG + added.fatG,
  });
}

/**
 * Redistributes already-resolved nutrition using observed cooking weights.
 * Missing water change or incorporated oil remain unresolved (`null`); this
 * function never estimates either value and performs no intermediate rounding.
 */
export function calculateCookingYield(input: CookingYieldInput): CookingYieldResult {
  requirePositiveFinite(input.rawWeightG, "rawWeightG");
  requirePositiveFinite(input.cookedWeightG, "cookedWeightG");
  requirePositiveFinite(input.servings, "servings");
  if (!Number.isInteger(input.servings)) {
    throw new RangeError("servings must be an integer");
  }
  requireNutritionTotals(input.resolvedNutritionTotal, "resolvedNutritionTotal");

  if (input.netWaterChangeG !== undefined && !Number.isFinite(input.netWaterChangeG)) {
    throw new RangeError("netWaterChangeG must be a finite number");
  }

  const oil = input.incorporatedOil;
  if (oil) {
    requirePositiveFinite(oil.weightG, "incorporatedOil.weightG");
    if (oil.nutritionTotal) {
      requireNutritionTotals(oil.nutritionTotal, "incorporatedOil.nutritionTotal");
    }
  }

  if (input.netWaterChangeG !== undefined) {
    const expectedCookedWeight = input.rawWeightG + input.netWaterChangeG + (oil?.weightG ?? 0);
    if (expectedCookedWeight !== input.cookedWeightG) {
      throw new RangeError("cookedWeightG is inconsistent with the explicit water and oil changes");
    }
  }

  const nutritionTotal = addNutrition(input.resolvedNutritionTotal, oil?.nutritionTotal);
  const incorporatedOil = oil
    ? Object.freeze({
        weightG: oil.weightG,
        ...(oil.nutritionTotal ? { nutritionTotal: Object.freeze({ ...oil.nutritionTotal }) } : {}),
      })
    : null;

  return Object.freeze({
    rawWeightG: input.rawWeightG,
    cookedWeightG: input.cookedWeightG,
    servings: input.servings,
    netWaterChangeG: input.netWaterChangeG ?? null,
    incorporatedOil,
    yieldFactor: input.cookedWeightG / input.rawWeightG,
    cookedWeightPerServingG: input.cookedWeightG / input.servings,
    nutritionTotal,
    nutritionPerServing: mapNutrition(nutritionTotal, input.servings),
    nutritionPer100gCooked: mapNutrition(nutritionTotal, input.cookedWeightG / 100),
  });
}
