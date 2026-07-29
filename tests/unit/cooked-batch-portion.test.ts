import { describe, expect, it } from "vitest";
import { calculateCookedBatchPortion } from "@/modules/recipes/cooked-batch-portion";

const nutrition = { calories: 900, proteinG: 60, carbsG: 90, fatG: 30 } as const;
const confirmedMeasurement = { rawWeightG: 1_000, cookedWeightG: 750, servings: 3 } as const;

function calculate(consumption: { servingsConsumed: number } | { cookedWeightConsumedG: number }) {
  return calculateCookedBatchPortion({ resolvedNutritionTotal: nutrition, confirmedMeasurement, consumption });
}

describe("cooked batch portion", () => {
  it("calculates an explicit serving consumption", () => {
    expect(calculate({ servingsConsumed: 1 })).toEqual({
      consumedFraction: 1 / 3,
      consumedWeightG: 250,
      consumedServings: 1,
      consumedNutrition: { calories: 300, proteinG: 20, carbsG: 30, fatG: 10 },
      remainingWeightG: 500,
      remainingServings: 2,
      remainingNutrition: { calories: 600, proteinG: 40, carbsG: 60, fatG: 20 },
    });
  });

  it("calculates an explicit cooked-weight consumption", () => {
    expect(calculate({ cookedWeightConsumedG: 250 })).toEqual(calculate({ servingsConsumed: 1 }));
  });

  it("conserves every nutrition total exactly", () => {
    const result = calculate({ cookedWeightConsumedG: 175 });

    for (const nutrient of ["calories", "proteinG", "carbsG", "fatG"] as const) {
      expect(result.consumedNutrition[nutrient] + result.remainingNutrition[nutrient])
        .toBe(nutrition[nutrient]);
    }
  });

  it("allows consuming the complete confirmed batch", () => {
    const result = calculate({ servingsConsumed: 3 });

    expect(result.consumedFraction).toBe(1);
    expect(result.consumedWeightG).toBe(750);
    expect(result.consumedNutrition).toEqual(nutrition);
    expect(result.remainingWeightG).toBe(0);
    expect(result.remainingServings).toBe(0);
    expect(result.remainingNutrition).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("normalizes an equivalent full-batch decimal without negative remainders", () => {
    const result = calculateCookedBatchPortion({
      resolvedNutritionTotal: nutrition,
      confirmedMeasurement: { ...confirmedMeasurement, cookedWeightG: 0.3 },
      consumption: { cookedWeightConsumedG: 0.1 + 0.2 },
    });

    expect(result.consumedFraction).toBe(1);
    expect(result.consumedWeightG).toBe(0.3);
    expect(result.remainingWeightG).toBe(0);
    expect(result.remainingServings).toBe(0);
    expect(result.remainingNutrition).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("preserves fractional servings without intermediate rounding", () => {
    const result = calculate({ servingsConsumed: 0.7 });

    expect(result.consumedFraction).toBe(0.7 / 3);
    expect(result.consumedWeightG).toBe(750 * (0.7 / 3));
    expect(result.consumedServings).toBe(3 * (0.7 / 3));
  });

  it.each([
    { servingsConsumed: 3.1 },
    { cookedWeightConsumedG: 750.1 },
  ])("rejects consumption above the confirmed batch: %j", (consumption) => {
    expect(() => calculate(consumption)).toThrow(/cannot exceed/);
  });

  it("rejects both consumption units or neither", () => {
    expect(() => calculateCookedBatchPortion({
      resolvedNutritionTotal: nutrition,
      confirmedMeasurement,
      consumption: { servingsConsumed: 1, cookedWeightConsumedG: 250 },
    } as never)).toThrow(/exactly one/);
    expect(() => calculateCookedBatchPortion({
      resolvedNutritionTotal: nutrition,
      confirmedMeasurement,
      consumption: {},
    } as never)).toThrow(/exactly one/);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid consumed values: %s", (value) => {
    expect(() => calculate({ servingsConsumed: value })).toThrow(RangeError);
    expect(() => calculate({ cookedWeightConsumedG: value })).toThrow(RangeError);
  });

  it("rejects invalid confirmed measurements and nutrition", () => {
    expect(() => calculateCookedBatchPortion({
      resolvedNutritionTotal: nutrition,
      confirmedMeasurement: { ...confirmedMeasurement, cookedWeightG: Number.NaN },
      consumption: { servingsConsumed: 1 },
    })).toThrow(RangeError);
    expect(() => calculateCookedBatchPortion({
      resolvedNutritionTotal: { ...nutrition, calories: -1 },
      confirmedMeasurement,
      consumption: { servingsConsumed: 1 },
    })).toThrow(RangeError);
  });

  it("returns deeply immutable nutrition results without mutating its input", () => {
    const input = { resolvedNutritionTotal: nutrition, confirmedMeasurement, consumption: { servingsConsumed: 1 } } as const;
    const before = JSON.stringify(input);
    const result = calculateCookedBatchPortion(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.consumedNutrition)).toBe(true);
    expect(Object.isFrozen(result.remainingNutrition)).toBe(true);
  });
});
