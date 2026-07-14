import { describe, expect, it } from "vitest";
import { getMaxCookableRecipeServings, scaleRecipeToServings } from "@/modules/recipes/recipe-servings";
import type { RecipeIngredient, RecipeInventoryItem, RecipeTemplate } from "@/modules/recipes/recipe-matching";

function ingredient(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    id: overrides.id ?? `ingredient-${overrides.sort_order ?? 1}`,
    recipe_id: "recipe",
    display_name: "Pollo",
    match_terms: ["pollo"],
    required_quantity: 400,
    required_unit: "g",
    is_required: true,
    sort_order: 1,
    ...overrides,
  };
}

function recipe(overrides: Partial<RecipeTemplate> = {}): RecipeTemplate {
  return {
    id: "recipe",
    slug: "receta",
    title: "Receta",
    description: "Una receta",
    prep_minutes: 20,
    servings: 4,
    instructions: ["Cocina."],
    recipe_ingredients: [ingredient()],
    ...overrides,
  };
}

function inventory(overrides: Partial<RecipeInventoryItem> = {}): RecipeInventoryItem {
  return { id: "item", name: "pollo", quantity: 100, unit: "g", expires_at: null, ...overrides };
}

describe("scaleRecipeToServings", () => {
  it("scales a 4-serving recipe to 1 serving", () => {
    const result = scaleRecipeToServings(recipe(), 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.servings).toBe(1);
    expect(result.recipe.recipe_ingredients[0].required_quantity).toBe(100);
  });

  it("keeps quantities unchanged when requesting all servings", () => {
    const result = scaleRecipeToServings(recipe({ servings: 2, recipe_ingredients: [ingredient({ required_quantity: 250 })] }), 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.servings).toBe(2);
    expect(result.recipe.recipe_ingredients[0].required_quantity).toBe(250);
  });

  it("scales several ingredients and units while preserving metadata and order", () => {
    const original = recipe({
      servings: 4,
      recipe_ingredients: [
        ingredient({ id: "g", display_name: "Pollo", match_terms: ["pollo"], required_quantity: 400, required_unit: "g", is_required: true, sort_order: 1 }),
        ingredient({ id: "ml", display_name: "Caldo", match_terms: ["caldo"], required_quantity: 800, required_unit: "ml", is_required: true, sort_order: 2 }),
        ingredient({ id: "ud", display_name: "Huevo", match_terms: ["huevo"], required_quantity: 4, required_unit: "ud", is_required: false, sort_order: 3 }),
      ],
    });

    const result = scaleRecipeToServings(original, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.recipe_ingredients.map((item) => [item.id, item.required_quantity, item.required_unit, item.match_terms, item.is_required, item.sort_order])).toEqual([
      ["g", 100, "g", ["pollo"], true, 1],
      ["ml", 200, "ml", ["caldo"], true, 2],
      ["ud", 1, "ud", ["huevo"], false, 3],
    ]);
  });

  it.each([0, -1, 1.5, 5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid requested servings: %s", (requestedServings) => {
    expect(scaleRecipeToServings(recipe(), requestedServings).ok).toBe(false);
  });

  it("rejects invalid original servings", () => {
    expect(scaleRecipeToServings(recipe({ servings: 0 }), 1).ok).toBe(false);
    expect(scaleRecipeToServings(recipe({ servings: 1.5 }), 1).ok).toBe(false);
    expect(scaleRecipeToServings(recipe({ servings: Number.MAX_SAFE_INTEGER + 1 }), 1).ok).toBe(false);
  });

  it("rejects numeric underflow to zero and overflow to Infinity", () => {
    expect(scaleRecipeToServings(recipe({ servings: Number.MAX_SAFE_INTEGER, recipe_ingredients: [ingredient({ required_quantity: Number.MIN_VALUE })] }), 1)).toEqual({ ok: false, code: "invalid-scaled-quantity" });
    expect(scaleRecipeToServings(recipe({ servings: 1, recipe_ingredients: [ingredient({ required_quantity: Infinity })] }), 1)).toEqual({ ok: false, code: "invalid-scaled-quantity" });
  });

  it("does not mutate the original recipe or ingredients", () => {
    const original = recipe({ recipe_ingredients: [ingredient({ required_quantity: 400 })] });
    const before = JSON.stringify(original);

    const result = scaleRecipeToServings(original, 1);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.recipe_ingredients[0].required_quantity).toBe(400);
    if (result.ok) expect(result.recipe.recipe_ingredients[0]).not.toBe(original.recipe_ingredients[0]);
  });
});

describe("getMaxCookableRecipeServings", () => {
  it("returns 2 for a 4-serving recipe when inventory covers 2 servings", () => {
    expect(getMaxCookableRecipeServings(recipe(), [inventory({ quantity: 200 })], "2026-07-14")).toBe(2);
  });

  it("returns 0 when inventory cannot cover even 1 serving", () => {
    expect(getMaxCookableRecipeServings(recipe(), [inventory({ quantity: 99 })], "2026-07-14")).toBe(0);
  });

  it("returns all servings when inventory covers the full recipe", () => {
    expect(getMaxCookableRecipeServings(recipe(), [inventory({ quantity: 400 })], "2026-07-14")).toBe(4);
  });
});
