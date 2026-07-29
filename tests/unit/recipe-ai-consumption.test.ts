import { describe, expect, it } from "vitest";

import { buildRecipeConsumptionLines } from "@/modules/recipes/recipe-consumption";
import {
  mapRecipeAiCookRpcError,
  parseRecipeAiCookRequest,
  validateRecipeAiCookInventory,
  type RecipeAiCookInventoryItem,
} from "@/modules/recipes/recipe-ai-consumption";
import { buildRecipeAiNutritionAllocations } from "@/modules/recipes/recipe-ai-nutrition";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";

const id = "123e4567-e89b-42d3-a456-426614174000";
const secondId = "123e4567-e89b-42d3-a456-426614174001";

const recipe = {
  title: "Arroz rápido",
  description: "Receta temporal con inventario.",
  estimated_minutes: 20,
  servings: 2,
  ingredients: [{ inventory_item_id: id, name: "Arroz", quantity: 0.2, unit: "kg" }],
  steps: ["Prepara todos los ingredientes.", "Cocina hasta terminar."],
};

const item: RecipeAiCookInventoryItem = {
  id,
  name: "Arroz",
  quantity: 1,
  unit: "kg",
  expires_at: "2026-07-15",
  nutrition_basis: "per_100g",
  calories: 350,
  protein_g: 7,
  carbs_g: 77,
  fat_g: 1,
};

const request = { meal_type: "lunch", recipe };

describe("parseRecipeAiCookRequest", () => {
  it("accepts a valid strict cooking request", () => {
    expect(parseRecipeAiCookRequest(request)).toEqual(request);
  });

  it.each([
    { ...request, extra: true },
    { ...request, recipe: { ...recipe, nutrition: { calories: 1 } } },
    { ...request, recipe: { ...recipe, calories: 1 } },
    { ...request, recipe: { ...recipe, user_id: "user" } },
    { ...request, meal_type: "brunch" },
    { ...request, recipe: { ...recipe, ingredients: [{ ...recipe.ingredients[0], inventory_item_id: "bad" }] } },
    { ...request, recipe: { ...recipe, ingredients: [{ ...recipe.ingredients[0], quantity: 0 }] } },
    { ...request, recipe: { ...recipe, ingredients: [{ ...recipe.ingredients[0], quantity: -1 }] } },
    { ...request, recipe: { ...recipe, ingredients: [{ ...recipe.ingredients[0], quantity: Infinity }] } },
    { ...request, recipe: { ...recipe, ingredients: [{ ...recipe.ingredients[0], quantity: NaN }] } },
    { ...request, recipe: { ...recipe, ingredients: [{ ...recipe.ingredients[0] }, { ...recipe.ingredients[0] }] } },
    { ...request, recipe: { ...recipe, ingredients: Array.from({ length: 21 }, (_, index) => ({ ...recipe.ingredients[0], inventory_item_id: `123e4567-e89b-42d3-a456-4266141740${String(index).padStart(2, "0")}` })) } },
  ])("rejects unsafe payload %#", (payload) => {
    expect(parseRecipeAiCookRequest(payload)).toBeNull();
  });

  it("accepts exactly twenty unique ingredients", () => {
    const ingredients = Array.from({ length: 20 }, (_, index) => ({
      ...recipe.ingredients[0],
      inventory_item_id: `123e4567-e89b-42d3-a456-4266141740${String(index).padStart(2, "0")}`,
      name: `Producto ${index}`,
    }));

    expect(parseRecipeAiCookRequest({ ...request, recipe: { ...recipe, ingredients } })?.recipe.ingredients).toHaveLength(20);
  });
});

describe("validateRecipeAiCookInventory", () => {
  it("accepts current matching stock expiring today", () => {
    expect(validateRecipeAiCookInventory(recipe, [item], "2026-07-15")).toBeNull();
  });

  it("accepts products without expiration", () => {
    expect(validateRecipeAiCookInventory(recipe, [{ ...item, expires_at: null }], "2026-07-15")).toBeNull();
  });

  it.each([
    [[], "recipe-stale"],
    [[{ ...item, name: "Pasta" }], "recipe-stale"],
    [[{ ...item, unit: "g" }], "recipe-stale"],
    [[{ ...item, quantity: 0.1 }], "insufficient-stock"],
    [[{ ...item, expires_at: "2026-07-14" }], "expired-item"],
  ] as const)("returns %s for stale inventory", (inventory, code) => {
    expect(validateRecipeAiCookInventory(recipe, inventory, "2026-07-15")).toBe(code);
  });
});

describe("AI recipe allocation, nutrition and consumption lines", () => {
  it("rebuilds kg allocations, complete nutrition, and kg consumption lines", () => {
    const { allocations } = buildRecipeAiNutritionAllocations(recipe, new Map([[id, item]]));
    expect(allocations[0]).toMatchObject({ usedQuantity: 200, usedUnit: "g" });
    expect(estimateRecipeNutrition(allocations, recipe.servings).isComplete).toBe(true);
    expect(buildRecipeConsumptionLines(allocations, [item])).toEqual({ ok: true, lines: [{ item_id: id, consumed_quantity: 0.2 }] });
  });

  it("rebuilds l allocations and l consumption lines", () => {
    const milk = { ...item, id: secondId, name: "Leche", unit: "l", nutrition_basis: "per_100ml" as const };
    const milkRecipe = { ...recipe, ingredients: [{ inventory_item_id: secondId, name: "Leche", quantity: 0.5, unit: "l" }] };
    const { allocations } = buildRecipeAiNutritionAllocations(milkRecipe, new Map([[secondId, milk]]));
    expect(allocations[0]).toMatchObject({ usedQuantity: 500, usedUnit: "ml" });
    expect(buildRecipeConsumptionLines(allocations, [milk])).toEqual({ ok: true, lines: [{ item_id: secondId, consumed_quantity: 0.5 }] });
  });

  it("supports ud and marks incomplete or incompatible nutrition", () => {
    const egg = { ...item, unit: "ud", nutrition_basis: "per_unit" as const };
    const eggRecipe = { ...recipe, ingredients: [{ inventory_item_id: id, name: "Arroz", quantity: 2, unit: "ud" }] };
    const { allocations } = buildRecipeAiNutritionAllocations(eggRecipe, new Map([[id, egg]]));
    expect(allocations[0]).toMatchObject({ usedQuantity: 2, usedUnit: "ud" });
    expect(estimateRecipeNutrition(allocations, 2).isComplete).toBe(true);
    expect(estimateRecipeNutrition([{ ...allocations[0], calories: null }], 2).isComplete).toBe(false);
    expect(estimateRecipeNutrition([{ ...allocations[0], nutritionBasis: "per_100g" }], 2).isComplete).toBe(false);
  });
});

describe("mapRecipeAiCookRpcError", () => {
  it("maps concurrent stock and inventory RPC errors safely", () => {
    expect(mapRecipeAiCookRpcError({ message: "Inventory item not found" })).toBe("recipe-stale");
    expect(mapRecipeAiCookRpcError({ message: "Quantity exceeds available stock" })).toBe("insufficient-stock");
    expect(mapRecipeAiCookRpcError({ message: "Incomplete inventory nutrition" })).toBe("incomplete-nutrition");
    expect(mapRecipeAiCookRpcError({ message: "Incompatible inventory nutrition unit" })).toBe("incompatible-unit");
    expect(mapRecipeAiCookRpcError({ message: "equivalence_conflict" })).toBe("equivalence-conflict");
    expect(mapRecipeAiCookRpcError({ message: "Other" })).toBe("consume-failed");
  });
});
