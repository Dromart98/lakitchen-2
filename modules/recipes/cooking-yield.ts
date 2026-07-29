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
  nutritionTotal: Readonly<NutritionTotals> | null;
  nutritionPerServing: Readonly<NutritionTotals> | null;
  nutritionPer100gCooked: Readonly<NutritionTotals> | null;
}>;

const NUTRIENT_KEYS = ["calories", "proteinG", "carbsG", "fatG"] as const;
const FLOATING_POINT_TOLERANCE_MULTIPLIER = 8;

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

function resolveNutritionTotal(
  resolved: Readonly<NutritionTotals>,
  oil?: ExplicitIncorporatedOil,
): Readonly<NutritionTotals> | null {
  if (oil && !oil.nutritionTotal) return null;
  if (!oil) return Object.freeze({ ...resolved });

  return Object.freeze({
    calories: resolved.calories + oil.nutritionTotal!.calories,
    proteinG: resolved.proteinG + oil.nutritionTotal!.proteinG,
    carbsG: resolved.carbsG + oil.nutritionTotal!.carbsG,
    fatG: resolved.fatG + oil.nutritionTotal!.fatG,
  });
}

function areEquivalentWeights(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * FLOATING_POINT_TOLERANCE_MULTIPLIER;
}

/**
 * Redistributes already-resolved nutrition using observed cooking weights.
 * Missing water change or incorporated oil remain unresolved (`null`); this
 * function never estimates either value and performs no intermediate rounding.
 * Nutrition also remains unresolved when incorporated oil lacks nutrition data.
 */
export function calculateCookingYield(input: CookingYieldInput): CookingYieldResult {
  requirePositiveFinite(input.rawWeightG, "rawWeightG");
  requirePositiveFinite(input.cookedWeightG, "cookedWeightG");
  requirePositiveFinite(input.servings, "servings");
  if (!Number.isSafeInteger(input.servings)) {
    throw new RangeError("servings must be a safe integer");
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
    if (!areEquivalentWeights(expectedCookedWeight, input.cookedWeightG)) {
      throw new RangeError("cookedWeightG is inconsistent with the explicit water and oil changes");
    }
  }

  const nutritionTotal = resolveNutritionTotal(input.resolvedNutritionTotal, oil);
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
    nutritionPerServing: nutritionTotal ? mapNutrition(nutritionTotal, input.servings) : null,
    nutritionPer100gCooked: nutritionTotal ? mapNutrition(nutritionTotal, input.cookedWeightG / 100) : null,
  });
}
