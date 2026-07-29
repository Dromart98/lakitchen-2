import { describe, expect, it } from "vitest";

import { enrichRecipeAiSuggestionsWithNutrition, type RecipeAiNutritionInventoryItem } from "@/modules/recipes/recipe-ai-nutrition";
import type { RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";

const baseRecipe: RecipeAiSuggestion = {
  title: "Receta base",
  description: "Descripción",
  estimated_minutes: 20,
  servings: 2,
  ingredients: [
    { inventory_item_id: "rice", name: "Arroz", quantity: 100, unit: "g" },
  ],
  steps: ["Preparar los ingredientes.", "Cocinar hasta terminar."],
};

const rice: RecipeAiNutritionInventoryItem = {
  id: "rice",
  name: "Arroz",
  quantity: 500,
  unit: "g",
  category: "carb",
  expires_at: null,
  nutrition_basis: "per_100g",
  calories: 350,
  protein_g: 7,
  carbs_g: 77,
  fat_g: 1.2,
};

function enrich(recipe: RecipeAiSuggestion, inventory: RecipeAiNutritionInventoryItem[] = [rice]) {
  return enrichRecipeAiSuggestionsWithNutrition([recipe], inventory)[0].nutrition;
}

describe("enrichRecipeAiSuggestionsWithNutrition", () => {
  it("calculates per_100g nutrition with grams", () => {
    const nutrition = enrich(baseRecipe);
    expect(nutrition).toMatchObject({ isComplete: true, missingNutritionItemCount: 0, usedConfirmedUnitMeasure: false });
    expect(nutrition.total).toEqual({ calories: 350, proteinG: 7, carbsG: 77, fatG: 1.2 });
    expect(nutrition.perServing).toEqual({ calories: 175, proteinG: 3.5, carbsG: 38.5, fatG: 0.6 });
  });

  it("calculates per_100g nutrition with kilograms converted to grams", () => {
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "rice", name: "Arroz", quantity: 0.25, unit: "kg" }] });
    expect(nutrition.total?.calories).toBe(875);
    expect(nutrition.perServing?.calories).toBe(437.5);
  });

  it("calculates per_100ml nutrition with milliliters", () => {
    const milk: RecipeAiNutritionInventoryItem = { id: "milk", name: "Leche", quantity: 500, unit: "ml", category: "dairy", expires_at: null, nutrition_basis: "per_100ml", calories: 50, protein_g: 3, carbs_g: 5, fat_g: 1 };
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "milk", name: "Leche", quantity: 200, unit: "ml" }] }, [milk]);
    expect(nutrition.total).toEqual({ calories: 100, proteinG: 6, carbsG: 10, fatG: 2 });
  });

  it("calculates per_100ml nutrition with liters converted to milliliters", () => {
    const broth: RecipeAiNutritionInventoryItem = { id: "broth", name: "Caldo", quantity: 1, unit: "l", category: "other", expires_at: null, nutrition_basis: "per_100ml", calories: 12, protein_g: 1, carbs_g: 2, fat_g: 0 };
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "broth", name: "Caldo", quantity: 0.5, unit: "l" }] }, [broth]);
    expect(nutrition.total).toEqual({ calories: 60, proteinG: 5, carbsG: 10, fatG: 0 });
  });

  it("calculates per_unit nutrition with units", () => {
    const egg: RecipeAiNutritionInventoryItem = { id: "egg", name: "Huevo", quantity: 6, unit: "ud", category: "protein", expires_at: null, nutrition_basis: "per_unit", calories: 70, protein_g: 6, carbs_g: 0, fat_g: 5 };
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "egg", name: "Huevo", quantity: 3, unit: "ud" }] }, [egg]);
    expect(nutrition.total).toEqual({ calories: 210, proteinG: 18, carbsG: 0, fatG: 15 });
  });

  it("sums several ingredients and calculates per serving", () => {
    const oil: RecipeAiNutritionInventoryItem = { id: "oil", name: "Aceite", quantity: 50, unit: "ml", category: "fat", expires_at: null, nutrition_basis: "per_100ml", calories: 800, protein_g: 0, carbs_g: 0, fat_g: 90 };
    const nutrition = enrich({ ...baseRecipe, servings: 4, ingredients: [...baseRecipe.ingredients, { inventory_item_id: "oil", name: "Aceite", quantity: 10, unit: "ml" }] }, [rice, oil]);
    expect(nutrition.total).toEqual({ calories: 430, proteinG: 7, carbsG: 77, fatG: 10.2 });
    expect(nutrition.perServing).toEqual({ calories: 107.5, proteinG: 1.75, carbsG: 19.25, fatG: 2.55 });
  });

  it("calculates several recipes independently", () => {
    const recipes = [baseRecipe, { ...baseRecipe, title: "Doble", ingredients: [{ inventory_item_id: "rice", name: "Arroz", quantity: 200, unit: "g" }] }];
    const enriched = enrichRecipeAiSuggestionsWithNutrition(recipes, [rice]);
    expect(enriched[0].nutrition.total?.calories).toBe(350);
    expect(enriched[1].nutrition.total?.calories).toBe(700);
  });

  it("treats zero nutrition values as complete", () => {
    const water: RecipeAiNutritionInventoryItem = { id: "water", name: "Agua", quantity: 1, unit: "l", category: "other", expires_at: null, nutrition_basis: "per_100ml", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "water", name: "Agua", quantity: 250, unit: "ml" }] }, [water]);
    expect(nutrition).toEqual({ total: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, perServing: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, isComplete: true, missingNutritionItemCount: 0, usedConfirmedUnitMeasure: false });
  });

  it.each([
    [{ ...rice, protein_g: null }, "null field"],
    [{ ...rice, nutrition_basis: null }, "missing basis"],
    [{ ...rice, nutrition_basis: "per_100ml" as const }, "incompatible basis"],
    [{ ...rice, calories: Infinity }, "non-finite value"],
  ] as const)("marks nutrition incomplete for %s", (item, _label) => {
    const nutrition = enrich(baseRecipe, [item]);
    expect(nutrition).toEqual({ total: null, perServing: null, isComplete: false, missingNutritionItemCount: 1, usedConfirmedUnitMeasure: false });
  });

  it("marks nutrition incomplete for non-finite quantities", () => {
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "rice", name: "Arroz", quantity: Infinity, unit: "g" }] });
    expect(nutrition).toEqual({ total: null, perServing: null, isComplete: false, missingNutritionItemCount: 1, usedConfirmedUnitMeasure: false });
  });

  it("marks nutrition incomplete for unknown units", () => {
    const nutrition = enrich({ ...baseRecipe, ingredients: [{ inventory_item_id: "rice", name: "Arroz", quantity: 100, unit: "oz" }] });
    expect(nutrition).toEqual({ total: null, perServing: null, isComplete: false, missingNutritionItemCount: 1, usedConfirmedUnitMeasure: false });
  });

  it("counts unique products with missing nutrition", () => {
    const recipe = { ...baseRecipe, ingredients: [
      { inventory_item_id: "rice", name: "Arroz", quantity: 100, unit: "g" },
      { inventory_item_id: "rice", name: "Arroz", quantity: 50, unit: "g" },
      { inventory_item_id: "missing", name: "Producto", quantity: 1, unit: "ud" },
    ] };
    const nutrition = enrich(recipe, [{ ...rice, calories: null }]);
    expect(nutrition.missingNutritionItemCount).toBe(2);
  });

  it("handles missing inventory products defensively", () => {
    const nutrition = enrich(baseRecipe, []);
    expect(nutrition).toEqual({ total: null, perServing: null, isComplete: false, missingNutritionItemCount: 1, usedConfirmedUnitMeasure: false });
  });

  it("does not mutate recipes or inventory", () => {
    const recipe = structuredClone(baseRecipe);
    const inventory = structuredClone([rice]);
    const recipeBefore = structuredClone(recipe);
    const inventoryBefore = structuredClone(inventory);
    enrichRecipeAiSuggestionsWithNutrition([recipe], inventory);
    expect(recipe).toEqual(recipeBefore);
    expect(inventory).toEqual(inventoryBefore);
  });

  it("does not round nutrition values before returning", () => {
    const precise: RecipeAiNutritionInventoryItem = { ...rice, calories: 33.333, protein_g: 1.111, carbs_g: 2.222, fat_g: 3.333 };
    const nutrition = enrich({ ...baseRecipe, servings: 3, ingredients: [{ inventory_item_id: "rice", name: "Arroz", quantity: 50, unit: "g" }] }, [precise]);
    expect(nutrition.total?.calories).toBe(16.6665);
    expect(nutrition.perServing?.calories).toBeCloseTo(5.5555);
  });
});
