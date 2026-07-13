import { describe, expect, it } from "vitest";

import {
  calculateMealBuilderLineNutrition,
  calculateMealBuilderTotals,
  formatMealBuilderNutritionValue,
  isMealBuilderInventoryItemEligible,
  type MealBuilderLine,
} from "@/modules/meals/meal-builder";

const pasta: MealBuilderLine = {
  id: "pasta",
  name: "Pasta",
  quantity: 500,
  unit: "g",
  nutrition_basis: "per_100g",
  calories: 100,
  protein_g: 10,
  carbs_g: 20,
  fat_g: 2,
  consumed_quantity: 250,
};

const juice: MealBuilderLine = {
  id: "juice",
  name: "Zumo",
  quantity: 1000,
  unit: "ml",
  nutrition_basis: "per_100ml",
  calories: 40,
  protein_g: 1,
  carbs_g: 8,
  fat_g: 0.5,
  consumed_quantity: 250,
};

const egg: MealBuilderLine = {
  id: "egg",
  name: "Huevo",
  quantity: 6,
  unit: "ud",
  nutrition_basis: "per_unit",
  calories: 70,
  protein_g: 6,
  carbs_g: 1,
  fat_g: 5,
  consumed_quantity: 2,
};

describe("meal builder totals", () => {
  it("sums 250 g per 100 g and 250 ml per 100 ml products", () => {
    expect(calculateMealBuilderTotals([pasta, juice])).toEqual({
      calories: 350,
      protein_g: 27.5,
      carbs_g: 70,
      fat_g: 6.25,
    });
  });

  it("sums a per-unit product", () => {
    expect(calculateMealBuilderTotals([egg])).toEqual({
      calories: 140,
      protein_g: 12,
      carbs_g: 2,
      fat_g: 10,
    });
  });

  it("sums several valid lines", () => {
    expect(calculateMealBuilderTotals([pasta, juice, egg])).toEqual({
      calories: 490,
      protein_g: 39.5,
      carbs_g: 72,
      fat_g: 16.25,
    });
  });

  it("returns null when a quantity exceeds stock", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: 501 }])).toBeNull();
  });

  it("returns null for zero quantity", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: 0 }])).toBeNull();
  });

  it("returns null for negative quantity", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: -1 }])).toBeNull();
  });

  it("returns null for NaN and Infinity quantities", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: Number.NaN }])).toBeNull();
    expect(calculateMealBuilderTotals([{ ...pasta, consumed_quantity: Infinity }])).toBeNull();
  });

  it("returns null for incompatible units", () => {
    expect(calculateMealBuilderTotals([{ ...juice, unit: "g" }])).toBeNull();
    expect(isMealBuilderInventoryItemEligible({ ...juice, unit: "g" })).toBe(false);
  });

  it("returns null for incomplete nutrition", () => {
    expect(calculateMealBuilderTotals([{ ...pasta, calories: null }])).toBeNull();
    expect(isMealBuilderInventoryItemEligible({ ...pasta, calories: null })).toBe(false);
  });

  it("returns null for duplicate products", () => {
    expect(calculateMealBuilderTotals([pasta, { ...pasta, consumed_quantity: 100 }])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(calculateMealBuilderTotals([])).toBeNull();
  });

  it("formats values without non-finite output", () => {
    expect(formatMealBuilderNutritionValue(350)).toBe("350");
    expect(formatMealBuilderNutritionValue(6.25)).toBe("6.3");
    expect(formatMealBuilderNutritionValue(Number.NaN)).toBeNull();
    expect(formatMealBuilderNutritionValue(Infinity)).toBeNull();
  });

  it("calculates a single line preview with shared inventory nutrition rules", () => {
    expect(calculateMealBuilderLineNutrition(juice)).toEqual({
      calories: 100,
      protein_g: 2.5,
      carbs_g: 20,
      fat_g: 1.25,
    });
  });
});

describe("repeated meal builder drafts", () => {
  const meal = { name: "Bowl de pasta", meal_type: "lunch" };
  const currentPasta = { ...pasta, id: "pasta", consumed_quantity: undefined } as never as typeof pasta;
  const currentJuice = { ...juice, id: "juice", consumed_quantity: undefined } as never as typeof juice;

  it("creates available lines for a meal with two current products", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("pasta", "Pasta", 250, "g"), snapshot("juice", "Zumo", 200, "ml")], [currentPasta, currentJuice]);

    expect(draft.availableLines).toEqual([
      { itemId: "pasta", quantity: "250" },
      { itemId: "juice", quantity: "200" },
    ]);
    expect(draft.unavailableItems).toEqual([]);
  });

  it("marks deleted inventory products as missing", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("missing", "Yogur", 1, "ud")], [currentPasta]);

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems).toEqual([
      { sourceInventoryItemId: "missing", productName: "Yogur", consumedQuantity: 1, unit: "ud", reason: "missing" },
    ]);
  });

  it("marks current products with incomplete nutrition as incompatible", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("pasta", "Pasta", 250, "g")], [{ ...currentPasta, calories: null }]);

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems[0]?.reason).toBe("incompatible");
  });

  it("marks current products with incompatible units as incompatible", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("juice", "Zumo", 250, "ml")], [{ ...currentJuice, unit: "g" }]);

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems[0]?.reason).toBe("incompatible");
  });

  it("keeps the historical quantity when current stock is lower", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("pasta", "Pasta", 250, "g")], [{ ...currentPasta, quantity: 100 }]);

    expect(draft.availableLines).toEqual([{ itemId: "pasta", quantity: "250" }]);
  });

  it("preloads the historical meal name", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [], []);

    expect(draft.mealName).toBe("Bowl de pasta");
  });

  it("preloads a valid historical meal type", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [], []);

    expect(draft.mealType).toBe("lunch");
  });

  it("leaves invalid historical meal types unselected", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft({ ...meal, meal_type: "brunch" }, [], []);

    expect(draft.mealType).toBe("");
  });

  it("deduplicates duplicated snapshots", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("pasta", "Pasta", 250, "g"), snapshot("pasta", "Pasta", 100, "g")], [currentPasta]);

    expect(draft.availableLines).toEqual([{ itemId: "pasta", quantity: "250" }]);
  });

  it("limits available lines to ten snapshots", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const snapshots = Array.from({ length: 11 }, (_, index) => snapshot(`item-${index}`, `Producto ${index}`, 1, "ud"));
    const inventory = snapshots.map((entry) => ({
      id: entry.source_inventory_item_id,
      name: entry.product_name,
      quantity: 2,
      unit: "ud",
      nutrition_basis: "per_unit" as const,
      calories: 1,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
    }));
    const draft = createRepeatedMealBuilderDraft(meal, snapshots, inventory);

    expect(draft.availableLines).toHaveLength(10);
  });

  it("handles an empty snapshot list", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [], [currentPasta]);

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems).toEqual([]);
  });

  it("uses current inventory data instead of historical nutrition compatibility", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [{ ...snapshot("pasta", "Pasta", 250, "kg"), unit: "kg" }], [currentPasta]);

    expect(draft.availableLines).toEqual([{ itemId: "pasta", quantity: "250" }]);
  });

  it("does not copy historical macros into draft lines", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("pasta", "Pasta", 250, "g")], [currentPasta]);

    expect(draft.availableLines[0]).toEqual({ itemId: "pasta", quantity: "250" });
    expect(draft.availableLines[0]).not.toHaveProperty("calories");
    expect(draft.availableLines[0]).not.toHaveProperty("protein_g");
  });

  it("sorts unavailable items stably", async () => {
    const { createRepeatedMealBuilderDraft } = await import("@/modules/meals/meal-builder");
    const draft = createRepeatedMealBuilderDraft(meal, [
      snapshot("b", "Yogur", 1, "ud"),
      snapshot("c", "Arroz", 1, "g"),
      snapshot("a", "Yogur", 1, "ud"),
    ], []);

    expect(draft.unavailableItems.map((item) => item.sourceInventoryItemId)).toEqual(["c", "a", "b"]);
  });
});

function snapshot(sourceInventoryItemId: string, productName: string, consumedQuantity: number, unit: string) {
  return {
    source_inventory_item_id: sourceInventoryItemId,
    product_name: productName,
    consumed_quantity: consumedQuantity,
    unit,
  };
}
