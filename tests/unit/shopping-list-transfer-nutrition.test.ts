import { describe, expect, it } from "vitest";

import {
  buildShoppingListTransferNutritionUpdate,
  getShoppingListTransferNutritionPlan,
  type TransferredInventoryNutritionItem,
} from "@/modules/shopping-list/shopping-list-transfer-nutrition";

const validId = "123e4567-e89b-42d3-a456-426614174000";

function item(overrides: Partial<TransferredInventoryNutritionItem> = {}): TransferredInventoryNutritionItem {
  return {
    id: validId,
    name: "Pechuga de pollo",
    quantity: 1,
    unit: "kg",
    category: "protein",
    nutrition_basis: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    ...overrides,
  };
}

describe("getShoppingListTransferNutritionPlan", () => {
  it("estimates a valid product without nutrition", () => {
    expect(getShoppingListTransferNutritionPlan(item())).toMatchObject({ status: "estimate" });
  });

  it("keeps chicken name, quantity, unit, and category without multiplying macros", () => {
    const plan = getShoppingListTransferNutritionPlan(item({ name: "Pechuga de pollo", quantity: 1, unit: "kg", category: "protein" }));

    expect(plan).toEqual({
      status: "estimate",
      input: { name: "Pechuga de pollo", quantity: 1, unit: "kg", category: "protein" },
    });
  });

  it("estimates pasta in grams", () => {
    expect(getShoppingListTransferNutritionPlan(item({ name: "Pasta", quantity: 500, unit: "g", category: "carbohydrate" }))).toMatchObject({ status: "estimate" });
  });

  it("detects complete valid nutrition", () => {
    expect(getShoppingListTransferNutritionPlan(item({ nutrition_basis: "per_100g", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }))).toEqual({ status: "already-complete" });
  });

  it("preserves an item with only nutrition basis", () => {
    expect(getShoppingListTransferNutritionPlan(item({ nutrition_basis: "per_100g" }))).toEqual({ status: "preserve-existing" });
  });

  it("preserves an item with only calories", () => {
    expect(getShoppingListTransferNutritionPlan(item({ calories: 120 }))).toEqual({ status: "preserve-existing" });
  });

  it("preserves an item with some macros", () => {
    expect(getShoppingListTransferNutritionPlan(item({ protein_g: 20, fat_g: 2 }))).toEqual({ status: "preserve-existing" });
  });

  it.each(["", "A"])("rejects empty or one-character names", (name) => {
    expect(getShoppingListTransferNutritionPlan(item({ name }))).toEqual({ status: "invalid" });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid quantities", (quantity) => {
    expect(getShoppingListTransferNutritionPlan(item({ quantity }))).toEqual({ status: "invalid" });
  });

  it("rejects invalid units", () => {
    expect(getShoppingListTransferNutritionPlan(item({ unit: "oz" as TransferredInventoryNutritionItem["unit"] }))).toEqual({ status: "invalid" });
  });

  it("normalizes unknown categories to null without invalidating the product", () => {
    expect(getShoppingListTransferNutritionPlan(item({ category: "unknown" }))).toEqual({
      status: "estimate",
      input: { name: "Pechuga de pollo", quantity: 1, unit: "kg", category: null },
    });
  });

  it("does not mutate the input", () => {
    const input = item({ name: "  Pasta  ", category: "unknown" });
    const snapshot = structuredClone(input);

    getShoppingListTransferNutritionPlan(input);

    expect(input).toEqual(snapshot);
  });
});

describe("buildShoppingListTransferNutritionUpdate", () => {
  it("copies only nutrition fields and omits metadata", () => {
    const update = buildShoppingListTransferNutritionUpdate({
      nutrition_basis: "per_100g",
      calories: 0,
      protein_g: 0,
      carbs_g: 25,
      fat_g: 1,
      confidence: "high",
      assumptions: "dry product",
      food_state: "raw",
      normalized_food_name: "pasta",
    } as Parameters<typeof buildShoppingListTransferNutritionUpdate>[0] & { food_state: string; normalized_food_name: string });

    expect(update).toEqual({ nutrition_basis: "per_100g", calories: 0, protein_g: 0, carbs_g: 25, fat_g: 1 });
    expect(Object.keys(update).sort()).toEqual(["calories", "carbs_g", "fat_g", "nutrition_basis", "protein_g"].sort());
    expect(update).not.toHaveProperty("confidence");
    expect(update).not.toHaveProperty("assumptions");
    expect(update).not.toHaveProperty("food_state");
    expect(update).not.toHaveProperty("normalized_food_name");
  });

  it("does not perform network requests or require an API key", () => {
    expect(process.env.OPENAI_API_KEY).not.toBe("sk-real-api-key");
    expect(getShoppingListTransferNutritionPlan(item())).toMatchObject({ status: "estimate" });
  });
});
