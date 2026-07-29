import { describe, expect, it } from "vitest";
import { parseSavedAiRecipeCookedBatchRow } from "@/modules/recipes/saved-ai-recipe-cooked-batch";

const validRow = {
  id: "private-batch-id",
  user_id: "private-owner-id",
  source_recipe_id: "private-recipe-id",
  recipe_title: "Arroz con pollo",
  raw_weight_g: "800.5",
  cooked_weight_g: 650,
  servings: 4,
  total_calories: "1200.25",
  total_protein_g: 80,
  total_carbs_g: 140,
  total_fat_g: 35,
  consumed_cooked_weight_g: 0,
  created_at: "2026-07-29T12:00:00.000Z",
  updated_at: "2026-07-29T12:00:00.000Z",
};

describe("saved AI recipe cooked batch row parser", () => {
  it("returns only the immutable snapshot from a valid row without mutating it", () => {
    const before = structuredClone(validRow);
    const parsed = parseSavedAiRecipeCookedBatchRow(validRow);

    expect(parsed).toEqual({
      recipeTitle: "Arroz con pollo",
      rawWeightG: 800.5,
      cookedWeightG: 650,
      servings: 4,
      totalNutrition: { calories: 1200.25, proteinG: 80, carbsG: 140, fatG: 35 },
      consumedCookedWeightG: 0,
      createdAt: "2026-07-29T12:00:00.000Z",
      updatedAt: "2026-07-29T12:00:00.000Z",
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.totalNutrition)).toBe(true);
    expect(validRow).toEqual(before);
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("sourceRecipeId");
  });

  it("uses Unicode characters rather than UTF-16 code units for the title limit", () => {
    expect(parseSavedAiRecipeCookedBatchRow({ ...validRow, recipe_title: "🍲".repeat(90) })).not.toBeNull();
    expect(parseSavedAiRecipeCookedBatchRow({ ...validRow, recipe_title: "🍲".repeat(91) })).toBeNull();
  });

  it.each([
    { recipe_title: "" },
    { raw_weight_g: 0 },
    { raw_weight_g: " 800.5" },
    { raw_weight_g: Infinity },
    { cooked_weight_g: NaN },
    { servings: 1.5 },
    { servings: 0 },
    { total_calories: -1 },
    { total_protein_g: "Infinity" },
    { total_carbs_g: NaN },
    { total_fat_g: -0.1 },
    { consumed_cooked_weight_g: -1 },
    { consumed_cooked_weight_g: 651 },
    { created_at: "not-a-date" },
    { updated_at: null },
    { updated_at: "2026-07-29T11:59:59.999Z" },
  ])("rejects a corrupt row atomically: %#", (change) => {
    expect(parseSavedAiRecipeCookedBatchRow({ ...validRow, ...change })).toBeNull();
  });
});
