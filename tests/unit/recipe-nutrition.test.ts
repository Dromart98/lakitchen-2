import { describe, expect, it } from "vitest";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";
import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";

function allocation(overrides: Partial<RecipeIngredientAllocation> = {}): RecipeIngredientAllocation {
  return {
    inventoryItemId: "item-1",
    inventoryItemName: "Producto",
    usedQuantity: 100,
    usedUnit: "g",
    nutritionBasis: "per_100g",
    calories: 200,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    ...overrides,
  };
}

describe("recipe nutrition", () => {
  it("calculates per_100g allocations", () => {
    expect(estimateRecipeNutrition([allocation({ usedQuantity: 150 })], 1).total).toEqual({ calories: 300, proteinG: 15, carbsG: 30, fatG: 7.5 });
  });

  it("calculates per_100ml allocations", () => {
    expect(estimateRecipeNutrition([allocation({ usedQuantity: 250, usedUnit: "ml", nutritionBasis: "per_100ml", calories: 40, proteinG: 1, carbsG: 9, fatG: 0 })], 1).total).toEqual({ calories: 100, proteinG: 2.5, carbsG: 22.5, fatG: 0 });
  });

  it("calculates per_unit allocations", () => {
    expect(estimateRecipeNutrition([allocation({ usedQuantity: 3, usedUnit: "ud", nutritionBasis: "per_unit", calories: 70, proteinG: 6, carbsG: 1, fatG: 4 })], 1).total).toEqual({ calories: 210, proteinG: 18, carbsG: 3, fatG: 12 });
  });

  it("sums several products", () => {
    const estimate = estimateRecipeNutrition([
      allocation({ inventoryItemId: "a", usedQuantity: 100, calories: 100, proteinG: 10, carbsG: 20, fatG: 1 }),
      allocation({ inventoryItemId: "b", usedQuantity: 200, calories: 50, proteinG: 2, carbsG: 8, fatG: 0.5 }),
    ], 1);
    expect(estimate.total).toEqual({ calories: 200, proteinG: 14, carbsG: 36, fatG: 2 });
  });

  it("divides by servings", () => {
    expect(estimateRecipeNutrition([allocation({ usedQuantity: 200 })], 4).perServing).toEqual({ calories: 100, proteinG: 5, carbsG: 10, fatG: 2.5 });
  });

  it("rejects partial data", () => {
    const estimate = estimateRecipeNutrition([allocation({ proteinG: null })], 1);
    expect(estimate).toEqual({ total: null, perServing: null, isComplete: false, missingNutritionItemCount: 1 });
  });

  it("rejects incompatible basis", () => {
    const estimate = estimateRecipeNutrition([allocation({ usedUnit: "ml", nutritionBasis: "per_100g" })], 1);
    expect(estimate.total).toBeNull();
    expect(estimate.isComplete).toBe(false);
    expect(estimate.missingNutritionItemCount).toBe(1);
  });

  it("rejects empty basis", () => {
    expect(estimateRecipeNutrition([allocation({ nutritionBasis: null })], 1).isComplete).toBe(false);
  });

  it("accepts zero as valid nutrition", () => {
    const estimate = estimateRecipeNutrition([allocation({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })], 1);
    expect(estimate).toEqual({ total: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, perServing: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, isComplete: true, missingNutritionItemCount: 0 });
  });

  it("rejects invalid servings", () => {
    expect(estimateRecipeNutrition([allocation()], 0).isComplete).toBe(false);
    expect(estimateRecipeNutrition([allocation()], Number.POSITIVE_INFINITY).isComplete).toBe(false);
  });

  it("rejects absence of allocations", () => {
    expect(estimateRecipeNutrition([], 1)).toEqual({ total: null, perServing: null, isComplete: false, missingNutritionItemCount: 0 });
  });

  it("does not mutate allocations", () => {
    const allocations = [allocation()];
    const before = JSON.stringify(allocations);
    estimateRecipeNutrition(allocations, 1);
    expect(JSON.stringify(allocations)).toBe(before);
  });

  it("does not round prematurely", () => {
    const estimate = estimateRecipeNutrition([allocation({ usedQuantity: 33.333, calories: 10, proteinG: 1, carbsG: 2, fatG: 3 })], 3);
    expect(estimate.total?.calories).toBeCloseTo(3.3333);
    expect(estimate.perServing?.fatG).toBeCloseTo(0.33333);
  });
});
