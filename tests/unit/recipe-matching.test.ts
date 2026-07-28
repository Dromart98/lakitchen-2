import { describe, expect, it } from "vitest";
import {
  areRecipeUnitsCompatible,
  convertRecipeQuantityToBase,
  filterRecipeMatches,
  matchRecipesToInventory,
  normalizeRecipeMatchTerm,
  sortRecipeMatches,
  toRecipeInventoryItem,
  type RecipeIngredient,
  type RecipeMatchResult,
  type RecipeTemplate,
} from "@/modules/recipes/recipe-matching";

function ingredient(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { id: `ing-${overrides.sort_order ?? 1}-${overrides.display_name ?? "x"}`, recipe_id: "recipe", display_name: "Pollo", match_terms: ["pollo"], required_quantity: 100, required_unit: "g", is_required: true, sort_order: 1, ...overrides };
}

function recipe(overrides: Partial<RecipeTemplate> = {}): RecipeTemplate {
  return { id: "recipe", slug: "receta", title: "Receta", description: "Una receta", prep_minutes: 20, servings: 1, instructions: ["Cocina."], recipe_ingredients: [ingredient()], ...overrides };
}

function result(overrides: Partial<RecipeMatchResult>): RecipeMatchResult {
  return { recipe: recipe(), ingredientMatches: [], canCookNow: false, requiredIngredientCount: 1, availableRequiredIngredientCount: 0, completionRatio: 0, urgentItemCount: 0, nearestExpirationDate: null, ...overrides };
}

describe("recipe matching", () => {
  it("normalizes uppercase, accents, punctuation and spaces", () => {
    expect(normalizeRecipeMatchTerm("Pechuga de Pollo")).toBe("pechuga de pollo");
    expect(normalizeRecipeMatchTerm("Calabacín")).toBe("calabacin");
    expect(normalizeRecipeMatchTerm("Tomate, cebolla!")).toBe("tomate cebolla");
    expect(normalizeRecipeMatchTerm("  PASTA   de Lentejas ")).toBe("pasta de lentejas");
  });

  it("does not use substring matching", () => {
    const [missing] = matchRecipesToInventory([recipe({ recipe_ingredients: [ingredient({ display_name: "Pan", match_terms: ["pan"], required_unit: "ud" })] })], [{ id: "1", name: "pan integral grande", quantity: 1, unit: "ud", expires_at: null }], "2026-07-14");
    expect(missing.ingredientMatches[0].status).toBe("missing");
  });

  it("matches the exact central identity before the visible inventory name", () => {
    const matching = toRecipeInventoryItem({ id: "1", name: "pollo fresco", quantity: 100, unit: "g", expires_at: null, food_catalog_item_id: "food-a", food_catalog_items: { normalized_name: "pollo", aliases: [] } });
    const contradictory = toRecipeInventoryItem({ id: "2", name: "pollo", quantity: 100, unit: "g", expires_at: null, food_catalog_item_id: "food-b", food_catalog_items: { normalized_name: "pavo", aliases: [] } });

    expect(matchRecipesToInventory([recipe()], [matching], "2026-07-14")[0].canCookNow).toBe(true);
    expect(matchRecipesToInventory([recipe()], [contradictory], "2026-07-14")[0].ingredientMatches[0].status).toBe("missing");
  });

  it("matches sanitized identity aliases and ignores empty, invalid and duplicate aliases", () => {
    const item = toRecipeInventoryItem({ id: "1", name: "ave", quantity: 100, unit: "g", expires_at: null, food_catalog_item_id: "food-a", food_catalog_items: { normalized_name: "pavo", aliases: [" POLLO ", "pollo", "", null, 3] } });

    expect(item.foodIdentity).toEqual({ normalizedName: "pavo", aliases: ["pollo"] });
    expect(matchRecipesToInventory([recipe()], [item], "2026-07-14")[0].canCookNow).toBe(true);
  });

  it("falls back to the exact visible name only without a valid central identity", () => {
    const withoutIdentity = toRecipeInventoryItem({ id: "1", name: "pollo", quantity: 100, unit: "g", expires_at: null, food_catalog_item_id: null, food_catalog_items: null });
    const malformedRelation = toRecipeInventoryItem({ id: "2", name: "pollo", quantity: 100, unit: "g", expires_at: null, food_catalog_item_id: "food-a", food_catalog_items: [{ normalized_name: "pavo", aliases: [] }] });
    const malformedName = toRecipeInventoryItem({ id: "3", name: "pollo", quantity: 100, unit: "g", expires_at: null, food_catalog_item_id: "food-b", food_catalog_items: { normalized_name: 7, aliases: [] } });

    expect(withoutIdentity.foodIdentity).toBeNull();
    expect(malformedRelation.foodIdentity).toBeNull();
    expect(malformedName.foodIdentity).toBeNull();
    expect(matchRecipesToInventory([recipe()], [withoutIdentity], "2026-07-14")[0].canCookNow).toBe(true);
  });

  it("converts and validates units", () => {
    expect(convertRecipeQuantityToBase(50, "g")).toEqual({ quantity: 50, unit: "g" });
    expect(convertRecipeQuantityToBase(2, "kg")).toEqual({ quantity: 2000, unit: "g" });
    expect(areRecipeUnitsCompatible("g", "kg")).toBe(true);
    expect(convertRecipeQuantityToBase(250, "ml")).toEqual({ quantity: 250, unit: "ml" });
    expect(convertRecipeQuantityToBase(1.5, "l")).toEqual({ quantity: 1500, unit: "ml" });
    expect(areRecipeUnitsCompatible("ml", "l")).toBe(true);
    expect(areRecipeUnitsCompatible("ud", "ud")).toBe(true);
    expect(areRecipeUnitsCompatible("g", "ml")).toBe(false);
    expect(areRecipeUnitsCompatible("ud", "g")).toBe(false);
  });

  it("sums compatible rows and marks an ingredient available", () => {
    const [match] = matchRecipesToInventory([recipe()], [
      { id: "1", name: "pollo", quantity: 50, unit: "g", expires_at: null },
      { id: "2", name: "pollo", quantity: 0.05, unit: "kg", expires_at: null },
    ], "2026-07-14");
    expect(match.ingredientMatches[0].status).toBe("available");
    expect(match.canCookNow).toBe(true);
  });

  it("distinguishes missing, insufficient, incompatible and expired", () => {
    expect(matchRecipesToInventory([recipe()], [], "2026-07-14")[0].ingredientMatches[0].status).toBe("missing");
    expect(matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 50, unit: "g", expires_at: null }], "2026-07-14")[0].ingredientMatches[0].status).toBe("insufficient");
    expect(matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 1, unit: "ud", expires_at: null }], "2026-07-14")[0].ingredientMatches[0].status).toBe("incompatible");
    expect(matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: "2026-07-13" }], "2026-07-14")[0].ingredientMatches[0].status).toBe("expired");
  });

  it("counts urgency only for today and the next seven days", () => {
    expect(matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: "2026-07-14" }], "2026-07-14")[0].urgentItemCount).toBe(1);
    expect(matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: "2026-07-21" }], "2026-07-14")[0].urgentItemCount).toBe(1);
    expect(matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: "2026-07-22" }], "2026-07-14")[0].urgentItemCount).toBe(0);
  });

  it("does not let optional missing ingredients block cooking", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [ingredient(), ingredient({ id: "optional", display_name: "Perejil", match_terms: ["perejil"], is_required: false, sort_order: 2 })] })], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: null }], "2026-07-14");
    expect(match.canCookNow).toBe(true);
    expect(match.ingredientMatches[1].status).toBe("missing");
  });


  it("prioritizes required ingredients over optional ingredients when stock is limited", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [
      ingredient({ id: "optional", display_name: "Pollo opcional", is_required: false, sort_order: 1, required_quantity: 100 }),
      ingredient({ id: "required", display_name: "Pollo obligatorio", is_required: true, sort_order: 2, required_quantity: 100 }),
    ] })], [{ id: "1", name: "pollo", quantity: 100, unit: "g", expires_at: null }], "2026-07-14");

    expect(match.ingredientMatches.map((item) => item.ingredient.sort_order)).toEqual([1, 2]);
    expect(match.ingredientMatches[0].status).toBe("insufficient");
    expect(match.ingredientMatches[1].status).toBe("available");
    expect(match.canCookNow).toBe(true);
    expect(match.requiredIngredientCount).toBe(1);
    expect(match.availableRequiredIngredientCount).toBe(1);
    expect(match.completionRatio).toBe(1);
  });

  it("lets optional and required ingredients both use stock when enough remains", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [
      ingredient({ id: "optional", display_name: "Pollo opcional", is_required: false, sort_order: 1, required_quantity: 100 }),
      ingredient({ id: "required", display_name: "Pollo obligatorio", is_required: true, sort_order: 2, required_quantity: 100 }),
    ] })], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: null }], "2026-07-14");

    expect(match.ingredientMatches.map((item) => item.ingredient.sort_order)).toEqual([1, 2]);
    expect(match.ingredientMatches.map((item) => item.status)).toEqual(["available", "available"]);
    expect(match.canCookNow).toBe(true);
  });

  it("does not reuse the same stock for two ingredients", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [ingredient({ id: "a", sort_order: 1 }), ingredient({ id: "b", sort_order: 2 })] })], [{ id: "1", name: "pollo", quantity: 150, unit: "g", expires_at: null }], "2026-07-14");
    expect(match.ingredientMatches.map((item) => item.status)).toEqual(["available", "insufficient"]);
    expect(match.canCookNow).toBe(false);
  });

  it("calculates complete, incomplete and completionRatio", () => {
    const complete = matchRecipesToInventory([recipe()], [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: null }], "2026-07-14")[0];
    expect(complete.canCookNow).toBe(true);
    expect(complete.completionRatio).toBe(1);
    const incomplete = matchRecipesToInventory([recipe()], [], "2026-07-14")[0];
    expect(incomplete.canCookNow).toBe(false);
    expect(incomplete.completionRatio).toBe(0);
  });

  it("sorts by cookable, urgency, completion, time and title", () => {
    const sorted = sortRecipeMatches([
      result({ recipe: recipe({ title: "Lenta", prep_minutes: 30 }), canCookNow: true, urgentItemCount: 0, completionRatio: 1 }),
      result({ recipe: recipe({ title: "Urgente", prep_minutes: 20 }), canCookNow: true, urgentItemCount: 2, completionRatio: 1 }),
      result({ recipe: recipe({ title: "No", prep_minutes: 5 }), canCookNow: false, completionRatio: 0.5 }),
      result({ recipe: recipe({ title: "Rápida", prep_minutes: 10 }), canCookNow: true, urgentItemCount: 0, completionRatio: 1 }),
    ]);
    expect(sorted.map((item) => item.recipe.title)).toEqual(["Urgente", "Rápida", "Lenta", "No"]);
  });

  it("filters all, available, quick, urgent and invalid mode", () => {
    const matches = [
      result({ recipe: recipe({ title: "A", prep_minutes: 10 }), canCookNow: true, urgentItemCount: 0 }),
      result({ recipe: recipe({ title: "B", prep_minutes: 20 }), canCookNow: true, urgentItemCount: 1 }),
      result({ recipe: recipe({ title: "C", prep_minutes: 10 }), canCookNow: false, urgentItemCount: 1 }),
    ];
    expect(filterRecipeMatches(matches, "all")).toHaveLength(3);
    expect(filterRecipeMatches(matches, "available")).toHaveLength(2);
    expect(filterRecipeMatches(matches, "quick").map((item) => item.recipe.title)).toEqual(["A"]);
    expect(filterRecipeMatches(matches, "urgent").map((item) => item.recipe.title)).toEqual(["B"]);
    expect(filterRecipeMatches(matches, "other")).toHaveLength(3);
  });

  it("does not mutate input arrays or objects", () => {
    const recipes = [recipe()];
    const inventory = [{ id: "1", name: "pollo", quantity: 200, unit: "g", expires_at: null }];
    const beforeRecipes = JSON.stringify(recipes);
    const beforeInventory = JSON.stringify(inventory);
    const sortedInput = [result({ recipe: recipe({ title: "B" }) }), result({ recipe: recipe({ title: "A" }) })];
    matchRecipesToInventory(recipes, inventory, "2026-07-14");
    sortRecipeMatches(sortedInput);
    filterRecipeMatches(sortedInput, "all");
    expect(JSON.stringify(recipes)).toBe(beforeRecipes);
    expect(JSON.stringify(inventory)).toBe(beforeInventory);
    expect(sortedInput[0].recipe.title).toBe("B");
  });

  it("returns exact allocation details for one inventory lot", () => {
    const [match] = matchRecipesToInventory([recipe()], [{ id: "lot-1", name: "pollo", quantity: 200, unit: "g", expires_at: null, nutrition_basis: "per_100g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 }], "2026-07-14");

    expect(match.ingredientMatches[0].allocations).toEqual([{
      inventoryItemId: "lot-1",
      inventoryItemName: "pollo",
      usedQuantity: 100,
      usedUnit: "g",
      nutritionBasis: "per_100g",
      calories: 165,
      proteinG: 31,
      carbsG: 0,
      fatG: 4,
    }]);
  });

  it("keeps one exact allocation per lot when several lots cover an ingredient", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [ingredient({ required_quantity: 150 })] })], [
      { id: "older", name: "pollo", quantity: 100, unit: "g", expires_at: "2026-07-15", nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 0, fat_g: 1 },
      { id: "newer", name: "pollo", quantity: 100, unit: "g", expires_at: "2026-07-20", nutrition_basis: "per_100g", calories: 200, protein_g: 20, carbs_g: 0, fat_g: 2 },
    ], "2026-07-14");

    expect(match.ingredientMatches[0].allocations.map((item) => [item.inventoryItemId, item.usedQuantity])).toEqual([["older", 100], ["newer", 50]]);
  });

  it("uses expiration order when assigning lots", () => {
    const [match] = matchRecipesToInventory([recipe()], [
      { id: "late", name: "pollo", quantity: 100, unit: "g", expires_at: "2026-07-30", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null },
      { id: "soon", name: "pollo", quantity: 100, unit: "g", expires_at: "2026-07-15", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null },
    ], "2026-07-14");

    expect(match.ingredientMatches[0].allocations[0].inventoryItemId).toBe("soon");
    expect(match.urgentItemCount).toBe(1);
  });

  it("stores allocated kg inventory as grams without double conversion", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [ingredient({ required_quantity: 1500, required_unit: "g" })] })], [
      { id: "kg", name: "pollo", quantity: 2, unit: "kg", expires_at: null, nutrition_basis: "per_100g", calories: 100, protein_g: 10, carbs_g: 0, fat_g: 1 },
    ], "2026-07-14");

    expect(match.ingredientMatches[0].availableQuantity).toBe(1500);
    expect(match.ingredientMatches[0].allocations[0].usedQuantity).toBe(1500);
    expect(match.ingredientMatches[0].allocations[0].usedUnit).toBe("g");
  });

  it("stores allocated l inventory as milliliters without double conversion", () => {
    const [match] = matchRecipesToInventory([recipe({ recipe_ingredients: [ingredient({ required_quantity: 750, required_unit: "ml" })] })], [
      { id: "l", name: "pollo", quantity: 1, unit: "l", expires_at: null, nutrition_basis: "per_100ml", calories: 40, protein_g: 1, carbs_g: 9, fat_g: 0 },
    ], "2026-07-14");

    expect(match.ingredientMatches[0].availableQuantity).toBe(750);
    expect(match.ingredientMatches[0].allocations[0].usedQuantity).toBe(750);
    expect(match.ingredientMatches[0].allocations[0].usedUnit).toBe("ml");
  });

});
