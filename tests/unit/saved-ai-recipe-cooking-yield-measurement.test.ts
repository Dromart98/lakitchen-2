import { describe, expect, it } from "vitest";
import { parseSavedRecipeCookingYieldMeasurement, toSavedRecipeCookingYieldMeasurement } from "@/modules/recipes/saved-ai-recipe-cooking-yield-measurement";

const recipeId = "123e4567-e89b-42d3-a456-426614174000";

describe("saved recipe cooking yield measurement", () => {
  it("accepts only the three observed positive values", () => {
    expect(parseSavedRecipeCookingYieldMeasurement({ recipeId, rawWeightG: 800.5, cookedWeightG: 620, servings: 4 })).toEqual({ recipeId, rawWeightG: 800.5, cookedWeightG: 620, servings: 4 });
  });

  it.each([
    { recipeId: "bad", rawWeightG: 1, cookedWeightG: 1, servings: 1 },
    { recipeId, rawWeightG: 0, cookedWeightG: 1, servings: 1 },
    { recipeId, rawWeightG: Infinity, cookedWeightG: 1, servings: 1 },
    { recipeId, rawWeightG: 1, cookedWeightG: NaN, servings: 1 },
    { recipeId, rawWeightG: 1, cookedWeightG: 1, servings: 1.5 },
    { recipeId, rawWeightG: 1, cookedWeightG: 1, servings: Number.MAX_SAFE_INTEGER + 1 },
    { recipeId, rawWeightG: 1, cookedWeightG: 1, servings: 1, calories: 20 },
  ])("rejects invalid or derived input %#", (input) => expect(parseSavedRecipeCookingYieldMeasurement(input)).toBeNull());

  it("normalizes database numeric values without exposing private columns", () => {
    expect(toSavedRecipeCookingYieldMeasurement({ recipe_id: recipeId, user_id: "private", raw_weight_g: "800.5", cooked_weight_g: 620, servings: 4, updated_at: "private" })).toEqual({ rawWeightG: 800.5, cookedWeightG: 620, servings: 4 });
  });
});
