import { describe, expect, it } from "vitest";

import {
  buildSavedAiRecipeCookPlan,
  mapSavedAiRecipeCookRpcError,
  parseCookSavedAiRecipeInput,
  validateSavedAiRecipeCookInventory,
  type SavedAiRecipeInventoryItem,
} from "@/modules/recipes/saved-ai-recipe-consumption";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

const recipeId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const itemA = "11111111-1111-4111-8111-111111111111";
const itemB = "22222222-2222-4222-8222-222222222222";

function recipe(overrides: Partial<SavedAiRecipe> = {}): SavedAiRecipe {
  return {
    id: recipeId,
    user_id: userId,
    title: "Arroz con leche",
    description: "Cena fácil",
    estimated_minutes: 20,
    servings: 2,
    steps: ["Cocer", "Servir"],
    source_priority_mode: "balanced",
    fingerprint: "abc",
    created_at: "2026-07-15T00:00:00.000Z",
    ingredients: [
      { id: "55555555-5555-4555-8555-555555555555", recipe_id: recipeId, user_id: userId, inventory_item_id: itemA, name: "Arroz", quantity: 0.2, unit: "kg", sort_order: 0, created_at: "2026-07-15T00:00:00.000Z" },
      { id: "66666666-6666-4666-8666-666666666666", recipe_id: recipeId, user_id: userId, inventory_item_id: itemB, name: "Leche", quantity: 0.5, unit: "l", sort_order: 1, created_at: "2026-07-15T00:00:00.000Z" },
    ],
    ...overrides,
  };
}

function inventory(overrides: Partial<SavedAiRecipeInventoryItem>[] = []): SavedAiRecipeInventoryItem[] {
  const base: SavedAiRecipeInventoryItem[] = [
    { id: itemA, name: "Arroz", quantity: 1, unit: "kg", expires_at: "2026-07-20", nutrition_basis: "per_100g", calories: 350, protein_g: 7, carbs_g: 77, fat_g: 1 },
    { id: itemB, name: "Leche", quantity: 1, unit: "l", expires_at: "2026-07-20", nutrition_basis: "per_100ml", calories: 60, protein_g: 3, carbs_g: 5, fat_g: 3 },
  ];
  return base.map((item, index) => ({ ...item, ...(overrides[index] ?? {}) }));
}

function manyIngredientFixture(count: number): { recipe: SavedAiRecipe; inventory: SavedAiRecipeInventoryItem[] } {
  const ingredients = Array.from({ length: count }, (_, index) => {
    const id = `${String(index + 1).padStart(8, "0")}-1111-4111-8111-${String(index + 1).padStart(12, "0")}`;
    return {
      id: `${String(index + 1).padStart(8, "0")}-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
      recipe_id: recipeId,
      user_id: userId,
      inventory_item_id: id,
      name: `Producto ${index + 1}`,
      quantity: 1,
      unit: "ud",
      sort_order: index,
      created_at: "2026-07-15T00:00:00.000Z",
    };
  });
  const inventoryItems = ingredients.map((ingredient) => ({
    id: ingredient.inventory_item_id,
    name: ingredient.name,
    quantity: 2,
    unit: "ud",
    expires_at: "2026-07-20",
    nutrition_basis: "per_unit" as const,
    calories: 10,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
  }));

  return { recipe: recipe({ ingredients }), inventory: inventoryItems };
}

describe("parseCookSavedAiRecipeInput", () => {
  it("accepts the exact public payload", () => {
    expect(parseCookSavedAiRecipeInput({ recipe_id: recipeId, meal_type: "lunch" })).toEqual({ recipe_id: recipeId, meal_type: "lunch" });
  });

  it("rejects invalid UUIDs and meal types", () => {
    expect(parseCookSavedAiRecipeInput({ recipe_id: "bad", meal_type: "lunch" })).toBeNull();
    expect(parseCookSavedAiRecipeInput({ recipe_id: recipeId, meal_type: "brunch" })).toBeNull();
  });

  it("rejects additional or sensitive properties", () => {
    expect(parseCookSavedAiRecipeInput({ recipe_id: recipeId, meal_type: "lunch", extra: true })).toBeNull();
    expect(parseCookSavedAiRecipeInput({ recipe_id: recipeId, meal_type: "lunch", user_id: userId })).toBeNull();
    expect(parseCookSavedAiRecipeInput({ recipe_id: recipeId, meal_type: "lunch", ingredients: [] })).toBeNull();
    expect(parseCookSavedAiRecipeInput({ recipe_id: recipeId, meal_type: "lunch", nutrition: {} })).toBeNull();
  });
});

describe("saved AI recipe cook validation", () => {
  it("treats a missing or other-user recipe as not found before pure validation", () => {
    expect(validateSavedAiRecipeCookInventory(recipe(), [], "2026-07-15")).toBe("recipe-stale");
  });

  it("rejects corrupt rows and duplicate ingredients", () => {
    expect(validateSavedAiRecipeCookInventory(recipe({ ingredients: [] }), inventory(), "2026-07-15")).toBe("recipe-corrupt");
    const duplicate = recipe();
    duplicate.ingredients = [duplicate.ingredients[0], { ...duplicate.ingredients[0], id: "77777777-7777-4777-8777-777777777777" }];
    expect(validateSavedAiRecipeCookInventory(duplicate, inventory(), "2026-07-15")).toBe("recipe-corrupt");
  });

  it("rejects deleted, renamed, reunitized, expired, or insufficient inventory", () => {
    expect(validateSavedAiRecipeCookInventory(recipe(), inventory().slice(0, 1), "2026-07-15")).toBe("recipe-stale");
    expect(validateSavedAiRecipeCookInventory(recipe(), inventory([{ name: "Pasta" }]), "2026-07-15")).toBe("recipe-stale");
    expect(validateSavedAiRecipeCookInventory(recipe(), inventory([{ unit: "g" }]), "2026-07-15")).toBe("recipe-stale");
    expect(validateSavedAiRecipeCookInventory(recipe(), inventory([{ expires_at: "2026-07-14" }]), "2026-07-15")).toBe("expired-item");
    expect(validateSavedAiRecipeCookInventory(recipe(), inventory([{ quantity: 0.1 }]), "2026-07-15")).toBe("insufficient-stock");
  });

  it("accepts a valid inventory snapshot", () => {
    expect(validateSavedAiRecipeCookInventory(recipe(), inventory(), "2026-07-15")).toBeNull();
  });

  it("rejects corrupt recipes with more than twenty ingredients", () => {
    const fixture = manyIngredientFixture(21);
    expect(validateSavedAiRecipeCookInventory(fixture.recipe, fixture.inventory, "2026-07-15")).toBe("too-many-items");
  });
});

describe("buildSavedAiRecipeCookPlan", () => {
  it("builds consumption lines for kg to g and l to ml conversions", () => {
    const result = buildSavedAiRecipeCookPlan(recipe(), inventory(), "dinner");
    expect(result).toMatchObject({ ok: true, plan: { mealType: "dinner", lines: [{ item_id: itemA, consumed_quantity: 0.2 }, { item_id: itemB, consumed_quantity: 0.5 }] } });
  });

  it("builds a complete plan for twenty ingredients", () => {
    const fixture = manyIngredientFixture(20);
    const result = buildSavedAiRecipeCookPlan(fixture.recipe, fixture.inventory, "lunch");

    expect(result).toMatchObject({ ok: true, plan: { lines: expect.arrayContaining([{ item_id: fixture.inventory[0].id, consumed_quantity: 1 }]) } });
    expect(result.ok && result.plan.lines).toHaveLength(20);
  });

  it("maps twenty-one ingredients to too-many-items instead of unexpected-error", () => {
    const fixture = manyIngredientFixture(21);

    expect(buildSavedAiRecipeCookPlan(fixture.recipe, fixture.inventory, "lunch")).toEqual({ ok: false, code: "too-many-items" });
  });

  it("supports compatible unit counts", () => {
    const unitRecipe = recipe({ ingredients: [{ ...recipe().ingredients[0], quantity: 2, unit: "ud" }] });
    const unitInventory = [{ ...inventory()[0], quantity: 6, unit: "ud", nutrition_basis: "per_unit" as const }];
    expect(buildSavedAiRecipeCookPlan(unitRecipe, unitInventory, "lunch")).toMatchObject({ ok: true, plan: { lines: [{ item_id: itemA, consumed_quantity: 2 }] } });
  });

  it("rejects incomplete nutrition and incompatible units", () => {
    expect(buildSavedAiRecipeCookPlan(recipe(), inventory([{ calories: null }]), "lunch")).toEqual({ ok: false, code: "nutrition-unavailable" });
    expect(buildSavedAiRecipeCookPlan(recipe({ ingredients: [{ ...recipe().ingredients[0], unit: "oz" }] }), inventory().slice(0, 1), "lunch")).toEqual({ ok: false, code: "incompatible-unit" });
  });

  it("is deterministic and does not mutate inputs", () => {
    const r = recipe();
    const items = inventory();
    const before = JSON.stringify({ r, items });
    expect(buildSavedAiRecipeCookPlan(r, items, "lunch")).toEqual(buildSavedAiRecipeCookPlan(r, items, "lunch"));
    expect(JSON.stringify({ r, items })).toBe(before);
  });

  it("keeps the saved recipe by only returning RPC lines", () => {
    const result = buildSavedAiRecipeCookPlan(recipe(), inventory(), "lunch");
    expect(result.ok && result.plan).not.toHaveProperty("deleteRecipeId");
  });
});

describe("mapSavedAiRecipeCookRpcError", () => {
  it("maps RPC errors to safe codes", () => {
    expect(mapSavedAiRecipeCookRpcError({ message: "Inventory item not found" })).toBe("recipe-stale");
    expect(mapSavedAiRecipeCookRpcError({ message: "Quantity exceeds available stock" })).toBe("insufficient-stock");
    expect(mapSavedAiRecipeCookRpcError({ message: "Incomplete inventory nutrition" })).toBe("nutrition-unavailable");
    expect(mapSavedAiRecipeCookRpcError({ message: "Incompatible inventory nutrition unit" })).toBe("incompatible-unit");
    expect(mapSavedAiRecipeCookRpcError({ message: "equivalence_conflict" })).toBe("equivalence-conflict");
    expect(mapSavedAiRecipeCookRpcError({ message: "relation inventory_items does not exist" })).toBe("consumption-conflict");
  });
});
