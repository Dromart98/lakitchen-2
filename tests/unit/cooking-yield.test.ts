import { describe, expect, it } from "vitest";
import { calculateCookingYield } from "@/modules/recipes/cooking-yield";

const nutrition = { calories: 900, proteinG: 60, carbsG: 90, fatG: 30 };

describe("cooking yield", () => {
  it("calculates yield, serving weight and the distinct nutrition bases", () => {
    const result = calculateCookingYield({
      rawWeightG: 1_000,
      cookedWeightG: 750,
      servings: 3,
      resolvedNutritionTotal: nutrition,
      netWaterChangeG: -250,
    });

    expect(result.yieldFactor).toBe(0.75);
    expect(result.cookedWeightPerServingG).toBe(250);
    expect(result.nutritionTotal).toEqual(nutrition);
    expect(result.nutritionPerServing).toEqual({ calories: 300, proteinG: 20, carbsG: 30, fatG: 10 });
    expect(result.nutritionPer100gCooked).toEqual({ calories: 120, proteinG: 8, carbsG: 12, fatG: 4 });
  });

  it("conserves total nutrients when only water changes", () => {
    const result = calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 400,
      servings: 2,
      resolvedNutritionTotal: nutrition,
      netWaterChangeG: -100,
    });

    expect(result.nutritionTotal).toEqual(nutrition);
    expect(result.nutritionPerServing.calories * result.servings).toBe(nutrition.calories);
  });

  it("adds oil nutrition only when it is explicitly supplied", () => {
    const withoutNutrition = calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 420,
      servings: 2,
      resolvedNutritionTotal: nutrition,
      netWaterChangeG: -100,
      incorporatedOil: { weightG: 20 },
    });
    const withNutrition = calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 420,
      servings: 2,
      resolvedNutritionTotal: nutrition,
      netWaterChangeG: -100,
      incorporatedOil: {
        weightG: 20,
        nutritionTotal: { calories: 180, proteinG: 0, carbsG: 0, fatG: 20 },
      },
    });

    expect(withoutNutrition.nutritionTotal).toEqual(nutrition);
    expect(withNutrition.nutritionTotal).toEqual({ calories: 1080, proteinG: 60, carbsG: 90, fatG: 50 });
  });

  it("leaves absent water and oil unresolved instead of estimating them", () => {
    const result = calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 350,
      servings: 1,
      resolvedNutritionTotal: nutrition,
    });

    expect(result.netWaterChangeG).toBeNull();
    expect(result.incorporatedOil).toBeNull();
  });

  it.each([
    ["zero raw weight", { rawWeightG: 0 }],
    ["negative cooked weight", { cookedWeightG: -1 }],
    ["NaN weight", { rawWeightG: Number.NaN }],
    ["infinite weight", { cookedWeightG: Number.POSITIVE_INFINITY }],
    ["zero servings", { servings: 0 }],
    ["fractional servings", { servings: 1.5 }],
    ["non-finite water change", { netWaterChangeG: Number.NaN }],
    ["zero explicit oil", { incorporatedOil: { weightG: 0 } }],
    ["negative nutrition", { resolvedNutritionTotal: { ...nutrition, calories: -1 } }],
    ["non-finite nutrition", { resolvedNutritionTotal: { ...nutrition, fatG: Number.POSITIVE_INFINITY } }],
  ])("rejects %s", (_name, override) => {
    expect(() => calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 400,
      servings: 2,
      resolvedNutritionTotal: nutrition,
      ...override,
    })).toThrow(RangeError);
  });

  it("rejects a final weight inconsistent with explicit water and oil", () => {
    expect(() => calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 450,
      servings: 2,
      resolvedNutritionTotal: nutrition,
      netWaterChangeG: -100,
      incorporatedOil: { weightG: 20 },
    })).toThrow(/inconsistent/);
  });

  it("rejects a final weight inconsistent with an explicit water change", () => {
    expect(() => calculateCookingYield({
      rawWeightG: 500,
      cookedWeightG: 450,
      servings: 2,
      resolvedNutritionTotal: nutrition,
      netWaterChangeG: -100,
    })).toThrow(/inconsistent/);
  });

  it("does not mutate its input or round intermediate results", () => {
    const input = {
      rawWeightG: 3,
      cookedWeightG: 2,
      servings: 3,
      resolvedNutritionTotal: { calories: 1, proteinG: 2, carbsG: 3, fatG: 4 },
    } as const;
    const before = JSON.stringify(input);
    const result = calculateCookingYield(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(result.yieldFactor).toBe(2 / 3);
    expect(result.nutritionPer100gCooked.calories).toBe(50);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
