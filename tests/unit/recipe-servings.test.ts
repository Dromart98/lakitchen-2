import { describe, expect, it } from "vitest";
import { buildRecipeMealName, buildRecipeMatchWithServingOptions, filterRecipeMatchesWithServingOptions, getMaxCookableRecipeServings, getMaxUrgentItemCountForCookableServings, getRecipeServingOptions, scaleRecipeToServings } from "@/modules/recipes/recipe-servings";
import { matchRecipesToInventory, type RecipeIngredient, type RecipeInventoryItem, type RecipeTemplate } from "@/modules/recipes/recipe-matching";

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


describe("getRecipeServingOptions", () => {
  it("keeps smaller loggable servings available when larger cookable servings need incomplete nutrition", () => {
    const options = getRecipeServingOptions(recipe(), [
      inventory({ id: "lot-a", quantity: 100, expires_at: "2026-07-15", nutrition_basis: "per_100g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 }),
      inventory({ id: "lot-b", quantity: 300, expires_at: "2026-07-20", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null }),
    ], "2026-07-14");

    expect(getMaxCookableRecipeServings(recipe(), [
      inventory({ id: "lot-a", quantity: 100, expires_at: "2026-07-15", nutrition_basis: "per_100g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 }),
      inventory({ id: "lot-b", quantity: 300, expires_at: "2026-07-20", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null }),
    ], "2026-07-14")).toBe(4);
    expect(options.map((option) => option.servings)).toEqual([1, 2, 3, 4]);
    expect(options[0].canCookNow).toBe(true);
    expect(options[0].nutrition?.isComplete).toBe(true);
    expect(options[0].canLog).toBe(true);
    expect(options.slice(1).map((option) => [option.canCookNow, option.nutrition?.isComplete, option.canLog])).toEqual([
      [true, false, false],
      [true, false, false],
      [true, false, false],
    ]);
    expect(options.filter((option) => option.canLog).map((option) => option.servings)).toEqual([1]);
  });

  it("marks all serving options loggable when all lots have complete nutrition", () => {
    const options = getRecipeServingOptions(recipe(), [
      inventory({ id: "lot-a", quantity: 100, expires_at: "2026-07-15", nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 }),
      inventory({ id: "lot-b", quantity: 300, expires_at: "2026-07-20", nutrition_basis: "per_100g", calories: 200, protein_g: 20, carbs_g: 2, fat_g: 4 }),
    ], "2026-07-14");

    expect(options.filter((option) => option.canLog).map((option) => option.servings)).toEqual([1, 2, 3, 4]);
  });

  it("keeps max cookable at 2 when inventory only covers 2 servings", () => {
    const options = getRecipeServingOptions(recipe(), [inventory({ quantity: 200, nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 })], "2026-07-14");

    expect(getMaxCookableRecipeServings(recipe(), [inventory({ quantity: 200, nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 })], "2026-07-14")).toBe(2);
    expect(options.map((option) => option.canCookNow)).toEqual([true, true, false, false]);
  });

  it("returns no loggable options and max 0 when no serving is cookable", () => {
    const options = getRecipeServingOptions(recipe(), [inventory({ quantity: 99, nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 })], "2026-07-14");

    expect(getMaxCookableRecipeServings(recipe(), [inventory({ quantity: 99, nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 })], "2026-07-14")).toBe(0);
    expect(options.filter((option) => option.canLog)).toEqual([]);
  });

  it("returns an empty list for invalid recipe servings", () => {
    expect(getRecipeServingOptions(recipe({ servings: 0 }), [inventory()], "2026-07-14")).toEqual([]);
  });

  it("does not mutate recipe or inventory", () => {
    const originalRecipe = recipe();
    const originalInventory = [inventory({ nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 })];
    const beforeRecipe = JSON.stringify(originalRecipe);
    const beforeInventory = JSON.stringify(originalInventory);

    getRecipeServingOptions(originalRecipe, originalInventory, "2026-07-14");

    expect(JSON.stringify(originalRecipe)).toBe(beforeRecipe);
    expect(JSON.stringify(originalInventory)).toBe(beforeInventory);
  });

  it("returns options in deterministic serving order", () => {
    expect(getRecipeServingOptions(recipe(), [inventory({ quantity: 400 })], "2026-07-14").map((option) => option.servings)).toEqual([1, 2, 3, 4]);
  });

  it("stores each total nutrition estimate from its own serving quantity and lot allocation", () => {
    const options = getRecipeServingOptions(recipe(), [
      inventory({ id: "lot-a", quantity: 100, expires_at: "2026-07-15", nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 1, fat_g: 2 }),
      inventory({ id: "lot-b", quantity: 300, expires_at: "2026-07-20", nutrition_basis: "per_100g", calories: 200, protein_g: 20, carbs_g: 2, fat_g: 4 }),
    ], "2026-07-14");

    expect(options.map((option) => option.nutrition?.total?.calories)).toEqual([100, 300, 500, 700]);
    expect(options.map((option) => option.nutrition?.total?.proteinG)).toEqual([10, 30, 50, 70]);
  });
});


describe("partial serving filters", () => {
  function enriched(recipeOverrides: Partial<RecipeTemplate>, inventoryItems: RecipeInventoryItem[]) {
    const targetRecipe = recipe(recipeOverrides);
    const [fullMatch] = matchRecipesToInventory([targetRecipe], inventoryItems, "2026-07-14");
    return buildRecipeMatchWithServingOptions(fullMatch, inventoryItems, "2026-07-14");
  }

  it("includes a 4-serving recipe with inventory for 2 in available even when the full match is not cookable", () => {
    const item = enriched({}, [inventory({ quantity: 200 })]);

    expect(item.match.canCookNow).toBe(false);
    expect(item.maxCookableServings).toBe(2);
    expect(filterRecipeMatchesWithServingOptions([item], "available")).toEqual([item]);
  });

  it("includes a partially cookable quick recipe when prep time is at most 15 minutes", () => {
    const item = enriched({ prep_minutes: 15 }, [inventory({ quantity: 200 })]);

    expect(filterRecipeMatchesWithServingOptions([item], "quick")).toEqual([item]);
  });

  it("excludes a partially cookable recipe from quick when prep time is above 15 minutes", () => {
    const item = enriched({ prep_minutes: 16 }, [inventory({ quantity: 200 })]);

    expect(filterRecipeMatchesWithServingOptions([item], "quick")).toEqual([]);
  });

  it("includes a recipe in urgent when a cookable partial serving uses an urgent lot", () => {
    const item = enriched({}, [inventory({ quantity: 200, expires_at: "2026-07-15" })]);

    expect(item.servingOptions.some((option) => option.canCookNow && option.urgentItemCount > 0)).toBe(true);
    expect(filterRecipeMatchesWithServingOptions([item], "urgent")).toEqual([item]);
    expect(getMaxUrgentItemCountForCookableServings(item.servingOptions)).toBe(1);
  });

  it("excludes a recipe from urgent when no cookable partial serving uses urgent products", () => {
    const item = enriched({}, [inventory({ quantity: 200, expires_at: "2026-08-01" })]);

    expect(filterRecipeMatchesWithServingOptions([item], "urgent")).toEqual([]);
    expect(getMaxUrgentItemCountForCookableServings(item.servingOptions)).toBe(0);
  });

  it("keeps uncookable recipes only in all", () => {
    const item = enriched({}, [inventory({ quantity: 99 })]);

    expect(filterRecipeMatchesWithServingOptions([item], "all")).toEqual([item]);
    expect(filterRecipeMatchesWithServingOptions([item], "available")).toEqual([]);
    expect(filterRecipeMatchesWithServingOptions([item], "quick")).toEqual([]);
    expect(filterRecipeMatchesWithServingOptions([item], "urgent")).toEqual([]);
  });

  it("does not require complete nutrition for available, quick, or urgent filters", () => {
    const item = enriched({ prep_minutes: 10 }, [inventory({ quantity: 200, expires_at: "2026-07-15", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null })]);

    expect(item.servingOptions.some((option) => option.canCookNow && !option.canLog)).toBe(true);
    expect(filterRecipeMatchesWithServingOptions([item], "available")).toEqual([item]);
    expect(filterRecipeMatchesWithServingOptions([item], "quick")).toEqual([item]);
    expect(filterRecipeMatchesWithServingOptions([item], "urgent")).toEqual([item]);
    expect(item.loggableServingOptions).toEqual([]);
  });
});

describe("buildRecipeMealName", () => {
  it("keeps a short title with one serving", () => {
    expect(buildRecipeMealName("Pollo con arroz", 1)).toBe("Pollo con arroz · 1 ración");
  });

  it("keeps a short title with several servings", () => {
    expect(buildRecipeMealName("Pollo con arroz", 4)).toBe("Pollo con arroz · 4 raciones");
  });

  it("truncates a 120-character title and preserves the full suffix", () => {
    const result = buildRecipeMealName("a".repeat(120), 4);

    expect(Array.from(result)).toHaveLength(120);
    expect(result.endsWith(" · 4 raciones")).toBe(true);
  });

  it("trims trailing spaces from a truncated or padded title before the separator", () => {
    expect(buildRecipeMealName("Pollo con arroz   ", 1)).toBe("Pollo con arroz · 1 ración");
  });

  it("does not split Unicode surrogate pairs while enforcing the max length", () => {
    const result = buildRecipeMealName("🍅".repeat(120), 4);

    expect(Array.from(result)).toHaveLength(120);
    expect(result.endsWith(" · 4 raciones")).toBe(true);
    expect(result).not.toContain("�");
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("uses a deterministic safe suffix for invalid servings: %s", (servings) => {
    const result = buildRecipeMealName("Pollo", servings);

    expect(result).toBe("Pollo · 1 ración");
    expect(Array.from(result).length).toBeLessThanOrEqual(120);
  });

  it("does not truncate when the title plus suffix fit within the limit", () => {
    const title = "a".repeat(120 - Array.from(" · 4 raciones").length);

    expect(buildRecipeMealName(title, 4)).toBe(`${title} · 4 raciones`);
  });
});
