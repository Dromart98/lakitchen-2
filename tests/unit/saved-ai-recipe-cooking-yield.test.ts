import { describe, expect, it } from "vitest";

import { buildSavedRecipeCookingYieldNutrition } from "@/modules/recipes/saved-ai-recipe-cooking-yield";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

const recipeId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

const recipe: SavedAiRecipe = {
  id: recipeId,
  user_id: "33333333-3333-4333-8333-333333333333",
  title: "Patata asada",
  description: "Una receta",
  estimated_minutes: 30,
  servings: 2,
  steps: ["Asar."],
  source_priority_mode: "balanced",
  fingerprint: "fingerprint",
  created_at: "2026-07-29T00:00:00.000Z",
  ingredients: [{
    id: "44444444-4444-4444-8444-444444444444",
    recipe_id: recipeId,
    user_id: "33333333-3333-4333-8333-333333333333",
    inventory_item_id: itemId,
    name: "Patata",
    quantity: 250,
    unit: "g",
    sort_order: 0,
    created_at: "2026-07-29T00:00:00.000Z",
  }],
};

function inventory(overrides: Record<string, unknown> = {}) {
  return new Map([[itemId, {
    id: itemId,
    name: "Patata",
    quantity: 500,
    unit: "g",
    expires_at: null,
    nutrition_basis: "per_100g" as const,
    calories: 80,
    protein_g: 2,
    carbs_g: 17,
    fat_g: 0.1,
    food_catalog_item_id: "55555555-5555-4555-8555-555555555555",
    ...overrides,
  }]]);
}

describe("saved AI recipe cooking yield nutrition", () => {
  it("reconstructs the recipe total from current inventory nutrition", () => {
    expect(buildSavedRecipeCookingYieldNutrition(recipe, inventory())).toEqual({
      status: "complete",
      total: { calories: 200, proteinG: 5, carbsG: 42.5, fatG: 0.25 },
    });
  });

  it("returns no partial totals when current nutrition is incomplete", () => {
    expect(buildSavedRecipeCookingYieldNutrition(recipe, inventory({ protein_g: null }))).toEqual({
      status: "incomplete",
      itemsToReview: 1,
    });
  });

  it("returns an incomplete state when an ingredient no longer matches inventory", () => {
    expect(buildSavedRecipeCookingYieldNutrition(recipe, new Map())).toEqual({
      status: "incomplete",
      itemsToReview: 1,
    });
  });
});
