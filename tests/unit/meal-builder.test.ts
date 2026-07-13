import { describe, expect, it } from "vitest";

import {
  calculateMealBuilderLineNutrition,
  calculateMealBuilderTotals,
  formatMealBuilderNutritionValue,
  isMealBuilderInventoryItemEligible,
  type MealBuilderLine,
} from "@/modules/meals/meal-builder";

const pasta: MealBuilderLine = {
  id: "pasta",
  name: "Pasta",
  quantity: 500,
  unit: "g",
  nutrition_basis: "per_100g",
  calories: 100,
  protein_g: 10,
  carbs_g: 20,
  fat_g: 2,
  consumed_quantity: 250,
};

const juice: MealBuilderLine = {
  id: "juice",
  name: "Zumo",
  quantity: 1000,
  unit: "ml",
  nutrition_basis: "per_100ml",
  calories: 40,
  protein_g: 1,
  carbs_g: 8,
  fat_g: 0.5,
  consumed_quantity: 250,
};

const egg: MealBuilderLine = {
  id: "egg",
  name: "Huevo",
  quantity: 6,
  unit: "ud",
  nutrition_basis: "per_unit",
  calories: 70,
  protein_g: 6,
  carbs_g: 1,
  fat_g: 5,
  consumed_quantity: 2,
};

describe("meal builder totals", () => {
  it("sums 250 g per 100 g and 250 ml per 100 ml products", () => {
    expect(calculateMealBuilderTotals([pasta, juice])).toEqual({
      calories: 350,
      protein_g: 27.5,
      carbs_g: 70,
      fat_g: 6.25,
    });
  });

  it("sums a per-unit product", () => {
    expect(calculateMealBuilderTotals([egg])).toEqual({
      calories: 140,
      protein_g: 12,
      carbs_g: 2,
      fat_g: 10,
    });
  });

  it("sums several valid lines", () => {
    expect(calculateMealBuilderTotals([pasta, juice, egg])).toEqual({
      calories: 490,
      protein_g: 39.5,
      carbs_g: 72,
      fat_g: 16.25,
    });
  });

  it("returns null when a quantity exceeds stock", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: 501 }])).toBeNull();
  });

  it("returns null for zero quantity", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: 0 }])).toBeNull();
  });

  it("returns null for negative quantity", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: -1 }])).toBeNull();
  });

  it("returns null for NaN and Infinity quantities", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: Number.NaN }])).toBeNull();
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: Infinity }])).toBeNull();
  });

  it("returns null for incompatible units", () => {
    expect(calculateMealBuilderTotals([{ ...juice, unit: "g" }])).toBeNull();
    expect(isMealBuilderInventoryItemEligible({ ...juice, unit: "g" })).toBe(false);
  });

  it("returns null for incomplete nutrition", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, calories: null }])).toBeNull();
    expect(isMealBuilderInventoryItemEligible({ ...pasta, calories: null })).toBe(false);
  });

  it("returns null for duplicate products", () => {
    expect(calculateMealBuilderTotals([pasta, { ...pasta, consumed_quantity: 100 }])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(calculateMealBuilderTotals([])).toBeNull();
  });

  it("formats values without non-finite output", () => {
    expect(formatMealBuilderNutritionValue(350)).toBe("350");
    expect(formatMealBuilderNutritionValue(6.25)).toBe("6.3");
    expect(formatMealBuilderNutritionValue(Number.NaN)).toBeNull();
    expect(formatMealBuilderNutritionValue(Infinity)).toBeNull();
  });

  it("calculates a single line preview with shared inventory nutrition rules", () => {
    expect(calculateMealBuilderLineNutrition(juice)).toEqual({
      calories: 100,
      protein_g: 2.5,
      carbs_g: 20,
      fat_g: 1.25,
    });
  });
});
