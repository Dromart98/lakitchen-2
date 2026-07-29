import type { NutritionTotals } from "@/modules/recipes/recipe-nutrition";
import type { SavedRecipeCookingYieldMeasurement } from "@/modules/recipes/saved-ai-recipe-cooking-yield-measurement";

export type ExplicitCookedBatchConsumption =
  | Readonly<{ servingsConsumed: number; cookedWeightConsumedG?: never }>
  | Readonly<{ servingsConsumed?: never; cookedWeightConsumedG: number }>;

export type CookedBatchPortionInput = Readonly<{
  resolvedNutritionTotal: Readonly<NutritionTotals>;
  confirmedMeasurement: SavedRecipeCookingYieldMeasurement;
  consumption: ExplicitCookedBatchConsumption;
}>;

export type CookedBatchPortionResult = Readonly<{
  consumedFraction: number;
  consumedWeightG: number;
  consumedServings: number;
  consumedNutrition: Readonly<NutritionTotals>;
  remainingWeightG: number;
  remainingServings: number;
  remainingNutrition: Readonly<NutritionTotals>;
}>;

const NUTRIENT_KEYS = ["calories", "proteinG", "carbsG", "fatG"] as const;
const FLOATING_POINT_TOLERANCE_MULTIPLIER = 8;

function requirePositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function requireNutritionTotals(nutrition: Readonly<NutritionTotals>): void {
  for (const key of NUTRIENT_KEYS) {
    if (!Number.isFinite(nutrition[key]) || nutrition[key] < 0) {
      throw new RangeError(`resolvedNutritionTotal.${key} must be a non-negative finite number`);
    }
  }
}

function areEquivalentValues(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * FLOATING_POINT_TOLERANCE_MULTIPLIER;
}

function splitNutrition(
  total: Readonly<NutritionTotals>,
  consumedFraction: number,
): readonly [Readonly<NutritionTotals>, Readonly<NutritionTotals>] {
  const consumed = Object.freeze({
    calories: total.calories * consumedFraction,
    proteinG: total.proteinG * consumedFraction,
    carbsG: total.carbsG * consumedFraction,
    fatG: total.fatG * consumedFraction,
  });
  const remaining = Object.freeze({
    calories: total.calories - consumed.calories,
    proteinG: total.proteinG - consumed.proteinG,
    carbsG: total.carbsG - consumed.carbsG,
    fatG: total.fatG - consumed.fatG,
  });

  return [consumed, remaining];
}

/**
 * Splits a confirmed cooked batch using exactly one explicit consumption basis.
 * All values retain full floating-point precision and no input is mutated.
 */
export function calculateCookedBatchPortion(input: CookedBatchPortionInput): CookedBatchPortionResult {
  const { cookedWeightG, servings } = input.confirmedMeasurement;
  requirePositiveFinite(cookedWeightG, "confirmedMeasurement.cookedWeightG");
  requirePositiveFinite(servings, "confirmedMeasurement.servings");
  if (!Number.isSafeInteger(servings)) {
    throw new RangeError("confirmedMeasurement.servings must be a safe integer");
  }
  requireNutritionTotals(input.resolvedNutritionTotal);

  const consumption = input.consumption as Record<string, unknown>;
  const hasServings = Object.prototype.hasOwnProperty.call(consumption, "servingsConsumed");
  const hasWeight = Object.prototype.hasOwnProperty.call(consumption, "cookedWeightConsumedG");
  if (hasServings === hasWeight) {
    throw new TypeError("consumption must specify exactly one of servingsConsumed or cookedWeightConsumedG");
  }

  const consumedValue = hasServings ? consumption.servingsConsumed : consumption.cookedWeightConsumedG;
  const consumedName = hasServings ? "servingsConsumed" : "cookedWeightConsumedG";
  if (typeof consumedValue !== "number") {
    throw new TypeError(`${consumedName} must be a number`);
  }
  requirePositiveFinite(consumedValue, consumedName);

  const batchValue = hasServings ? servings : cookedWeightG;
  const isCompleteBatch = areEquivalentValues(consumedValue, batchValue);
  if (consumedValue > batchValue && !isCompleteBatch) {
    throw new RangeError(`${consumedName} cannot exceed the confirmed batch`);
  }

  const normalizedConsumedValue = isCompleteBatch ? batchValue : consumedValue;
  const consumedFraction = normalizedConsumedValue / batchValue;
  const consumedWeightG = cookedWeightG * consumedFraction;
  const consumedServings = servings * consumedFraction;
  const [consumedNutrition, remainingNutrition] = splitNutrition(
    input.resolvedNutritionTotal,
    consumedFraction,
  );

  return Object.freeze({
    consumedFraction,
    consumedWeightG,
    consumedServings,
    consumedNutrition,
    remainingWeightG: cookedWeightG - consumedWeightG,
    remainingServings: servings - consumedServings,
    remainingNutrition,
  });
}
