import { describe, expect, it } from "vitest";

import { buildRecipeCalorieBudget, getRecipeCalorieTolerance, isRecipeServingWithinCalorieBudget, validateAndAdjustAiRecipeCalories } from "@/modules/recipes/recipe-calorie-budget";

const id = "123e4567-e89b-42d3-a456-426614174000";
const inventory = [{ id, name: "Arroz", quantity: 1000, unit: "g", expires_at: null, nutrition_basis: "per_100g" as const, calories: 100, protein_g: 2, carbs_g: 20, fat_g: 1 }];
const recipe = (quantity: number, servings = 1) => ({ title: "Arroz", description: "Arroz sencillo", estimated_minutes: 15, servings, ingredients: [{ inventory_item_id: id, name: "Arroz", quantity, unit: "g" }], steps: ["Cuece el arroz durante diez minutos.", "Sirve el arroz caliente en un plato."] });

describe("recipe calorie budget", () => {
  it("subtracts today's calories and accepts a 650 kcal serving with 700 remaining", () => {
    const budget = buildRecipeCalorieBudget(2200, 1500);
    expect(budget).toMatchObject({ remainingCalories: 700 });
    expect(isRecipeServingWithinCalorieBudget(650, budget!)).toBe(true);
  });

  it("never accepts an approximately 600 kcal excess", () => {
    const budget = buildRecipeCalorieBudget(2200, 1500)!;
    expect(isRecipeServingWithinCalorieBudget(1300, budget)).toBe(false);
    expect(getRecipeCalorieTolerance(700)).toBe(35);
  });

  it("uses total divided by servings", () => {
    const result = validateAndAdjustAiRecipeCalories(recipe(1200, 2), inventory, buildRecipeCalorieBudget(2200, 1500));
    expect(result.nutrition.total?.calories).toBe(1200);
    expect(result.nutrition.perServing?.calories).toBe(600);
    expect(result.calorieValidation.status).toBe("within-budget");
  });

  it("scales reasonable AI recipes and recalculates their deterministic macros", () => {
    const result = validateAndAdjustAiRecipeCalories(recipe(1300), inventory, buildRecipeCalorieBudget(2200, 1500));
    expect(result.calorieValidation.status).toBe("adjusted");
    expect(result.ingredients[0].quantity).toBeLessThan(1300);
    expect(result.nutrition.perServing?.calories).toBeLessThanOrEqual(735);
  });

  it("returns a clear non-viable state when safe scaling would be absurd", () => {
    const result = validateAndAdjustAiRecipeCalories(recipe(2000), inventory, buildRecipeCalorieBudget(2200, 1500));
    expect(result.calorieValidation.status).toBe("not-viable");
  });

  it("keeps the existing flow when no nutrition target exists", () => {
    expect(validateAndAdjustAiRecipeCalories(recipe(1300), inventory, null).calorieValidation.status).toBe("unavailable");
  });
});
