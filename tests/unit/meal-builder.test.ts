import { describe, expect, it } from "vitest";

import {
  calculateMealBuilderLineNutrition,
  calculateMealBuilderTotals,
  createMealBuilderConsumptionPayload,
  createRepeatedMealBuilderDraft,
  formatMealBuilderNutritionValue,
  isMealBuilderInventoryItemEligible,
  parseMealBuilderConsumptionLines,
  resolveMealBuilderReturnPath,
  buildMealBuilderCompatibilityDestination,
  buildMealBuilderResultDestination,
  type MealBuilderInventoryItem,
  type MealBuilderLine,
  type RepeatedMealBuilderSnapshot,
} from "@/modules/meals/meal-builder";
import { isValidUuid } from "@/modules/meals/meal-validation";

const supabaseInventoryItemId = "123e4567-e89b-42d3-a456-426614174000";

describe("meal builder UUID validation", () => {
  it("accepts a standard Supabase UUID before calling the consumption RPC", () => {
    expect(isValidUuid(supabaseInventoryItemId)).toBe(true);
    expect(parseMealBuilderConsumptionLines(JSON.stringify([
      { item_id: supabaseInventoryItemId, consumed_quantity: 200 },
    ]))).toEqual({
      lines: [{ item_id: supabaseInventoryItemId, consumed_quantity: 200 }],
    });
  });

  it("rejects UUIDs with a missing group", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456")).toBe(false);
  });

  it("rejects UUIDs with invalid characters", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-42661417400z")).toBe(false);
  });
});

describe("meal builder return path", () => {
  it.each([undefined, "", "/meal-builder", "/macros", "https://example.com", "//example.com", "/inventory"])("normalizes %s to Macros", (value) => {
    expect(resolveMealBuilderReturnPath(value)).toBe("/macros");
  });

  it("keeps only recognized legacy query parameters in an internal Macros URL", () => {
    expect(buildMealBuilderCompatibilityDestination({ repeatMeal: "123e4567-e89b-42d3-a456-426614174000", mealError: "invalid-lines", unknown: "https://example.com" })).toBe(
      "/macros?mealMode=ingredients&repeatMeal=123e4567-e89b-42d3-a456-426614174000&mealError=invalid-lines#registrar-comida",
    );
    expect(buildMealBuilderCompatibilityDestination({})).toBe("/macros?mealMode=ingredients#registrar-comida");
  });

  it("returns ingredient-mode action destinations with the registration fragment", () => {
    expect(buildMealBuilderResultDestination("mealSuccess", "meal-consumed-logged")).toBe(
      "/macros?mealMode=ingredients&mealSuccess=meal-consumed-logged#registrar-comida",
    );
  });
});

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

const currentPasta: MealBuilderInventoryItem = {
  id: pasta.id,
  name: pasta.name,
  quantity: pasta.quantity,
  unit: pasta.unit,
  nutrition_basis: pasta.nutrition_basis,
  calories: pasta.calories,
  protein_g: pasta.protein_g,
  carbs_g: pasta.carbs_g,
  fat_g: pasta.fat_g,
};

const currentJuice: MealBuilderInventoryItem = {
  id: juice.id,
  name: juice.name,
  quantity: juice.quantity,
  unit: juice.unit,
  nutrition_basis: juice.nutrition_basis,
  calories: juice.calories,
  protein_g: juice.protein_g,
  carbs_g: juice.carbs_g,
  fat_g: juice.fat_g,
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

describe("meal builder consumption payload", () => {
  it("rejects duplicate payload lines before an RPC can be called", () => {
    expect(parseMealBuilderConsumptionLines(JSON.stringify([
      { item_id: supabaseInventoryItemId, consumed_quantity: 200 },
      { item_id: supabaseInventoryItemId, consumed_quantity: 100 },
    ]))).toEqual({ error: "duplicate-product" });
  });

  it("rejects non-finite or non-positive payload quantities", () => {
    expect(parseMealBuilderConsumptionLines(JSON.stringify([
      { item_id: supabaseInventoryItemId, consumed_quantity: 0 },
    ]))).toEqual({ error: "invalid-quantity" });
  });

  it("creates a payload with two valid products", () => {
    expect(createMealBuilderConsumptionPayload([pasta, juice])).toEqual([
      { item_id: "pasta", consumed_quantity: 250 },
      { item_id: "juice", consumed_quantity: 250 },
    ]);
  });

  it("contains only item_id and consumed_quantity", () => {
    const payload = createMealBuilderConsumptionPayload([pasta]);

    expect(payload).toEqual([{ item_id: "pasta", consumed_quantity: 250 }]);
    expect(Object.keys(payload?.[0] ?? {}).sort()).toEqual(["consumed_quantity", "item_id"]);
  });

  it("does not include calories, macros, names, units, stock, or user_id", () => {
    const payload = createMealBuilderConsumptionPayload([{ ...pasta, user_id: "user" } as MealBuilderLine & { user_id: string }]);
    const serializedPayload = JSON.stringify(payload);

    expect(serializedPayload).not.toContain("calories");
    expect(serializedPayload).not.toContain("protein_g");
    expect(serializedPayload).not.toContain("carbs_g");
    expect(serializedPayload).not.toContain("fat_g");
    expect(serializedPayload).not.toContain("name");
    expect(serializedPayload).not.toContain("unit");
    expect(payload?.[0]).not.toHaveProperty("quantity");
    expect(serializedPayload).not.toContain("user_id");
  });

  it("rejects an empty list", () => {
    expect(createMealBuilderConsumptionPayload([])).toBeNull();
  });

  it("accepts twenty products and rejects twenty-one", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ ...pasta, id: `pasta-${index}` }));
    const twentyOne = Array.from({ length: 21 }, (_, index) => ({ ...pasta, id: `pasta-${index}` }));
    expect(createMealBuilderConsumptionPayload(twenty)).toHaveLength(20);
    expect(createMealBuilderConsumptionPayload(twentyOne)).toBeNull();
  });

  it("rejects duplicate products", () => {
    expect(createMealBuilderConsumptionPayload([pasta, { ...pasta, consumed_quantity: 100 }])).toBeNull();
  });

  it("rejects zero quantity", () => {
    expect(createMealBuilderConsumptionPayload([{ ...pasta, consumed_quantity: 0 }])).toBeNull();
  });

  it("rejects negative quantity", () => {
    expect(createMealBuilderConsumptionPayload([{ ...pasta, consumed_quantity: -1 }])).toBeNull();
  });

  it("rejects NaN and Infinity quantities", () => {
    expect(createMealBuilderConsumptionPayload([{ ...pasta, consumed_quantity: Number.NaN }])).toBeNull();
    expect(createMealBuilderConsumptionPayload([{ ...pasta, consumed_quantity: Infinity }])).toBeNull();
  });

  it("rejects quantity above stock", () => {
    expect(createMealBuilderConsumptionPayload([{ ...pasta, consumed_quantity: 501 }])).toBeNull();
  });

  it("rejects incomplete nutrition", () => {
    expect(createMealBuilderConsumptionPayload([{ ...pasta, calories: null }])).toBeNull();
  });

  it("rejects incompatible units", () => {
    expect(createMealBuilderConsumptionPayload([{ ...juice, unit: "g" }])).toBeNull();
  });

  it("keeps the pre-submit sum correct for g, ml, and ud", () => {
    expect(calculateMealBuilderTotals([pasta, juice, egg])).toEqual({
      calories: 490,
      protein_g: 39.5,
      carbs_g: 72,
      fat_g: 16.25,
    });
  });

  it("preserves exact totals before final SQL rounding", () => {
    const productA = { ...pasta, id: "a", calories: 10.4, protein_g: 10.4, carbs_g: 10.4, fat_g: 10.4, consumed_quantity: 100 };
    const productB = { ...pasta, id: "b", calories: 10.4, protein_g: 10.4, carbs_g: 10.4, fat_g: 10.4, consumed_quantity: 100 };

    const totals = calculateMealBuilderTotals([productA, productB]);

    expect(totals?.protein_g).toBe(20.8);
    expect(Math.round(totals?.protein_g ?? 0)).toBe(21);
    expect(Math.round(productA.protein_g) + Math.round(productB.protein_g)).toBe(20);
  });
});

describe("repeated meal builder drafts", () => {
  const meal = { name: "Bowl de pasta", meal_type: "lunch" };

  it("creates available lines for two current products", () => {
    const draft = createRepeatedMealBuilderDraft(
      meal,
      [snapshot("pasta", "Pasta", 250, "g"), snapshot("juice", "Zumo", 200, "ml")],
      [currentPasta, currentJuice],
    );

    expect(draft.availableLines).toEqual([
      { itemId: "pasta", quantity: "250" },
      { itemId: "juice", quantity: "200" },
    ]);
    expect(draft.unavailableItems).toEqual([]);
  });

  it("marks deleted inventory products as missing", () => {
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("missing", "Yogur", 1, "ud")], [currentPasta]);

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems).toEqual([
      { sourceInventoryItemId: "missing", productName: "Yogur", consumedQuantity: 1, unit: "ud", reason: "missing" },
    ]);
  });

  it("marks current products with incomplete nutrition as incompatible", () => {
    const draft = createRepeatedMealBuilderDraft(
      meal,
      [snapshot("pasta", "Pasta", 250, "g")],
      [{ ...currentPasta, calories: null }],
    );

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems[0]?.reason).toBe("incompatible");
  });

  it("marks current products with incompatible current units as incompatible", () => {
    const draft = createRepeatedMealBuilderDraft(
      meal,
      [snapshot("juice", "Zumo", 250, "ml")],
      [{ ...currentJuice, unit: "g" }],
    );

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems[0]?.reason).toBe("incompatible");
  });

  it("keeps the historical quantity when current stock is lower", () => {
    const draft = createRepeatedMealBuilderDraft(
      meal,
      [snapshot("pasta", "Pasta", 250, "g")],
      [{ ...currentPasta, quantity: 100 }],
    );

    expect(draft.availableLines).toEqual([{ itemId: "pasta", quantity: "250" }]);
  });

  it("preloads the historical meal name and valid type", () => {
    const draft = createRepeatedMealBuilderDraft(meal, [], []);

    expect(draft.mealName).toBe("Bowl de pasta");
    expect(draft.mealType).toBe("lunch");
  });

  it("leaves invalid historical meal types unselected", () => {
    const draft = createRepeatedMealBuilderDraft({ ...meal, meal_type: "brunch" }, [], []);

    expect(draft.mealType).toBe("");
  });

  it("deduplicates duplicated snapshots", () => {
    const draft = createRepeatedMealBuilderDraft(
      meal,
      [snapshot("pasta", "Pasta", 250, "g"), snapshot("pasta", "Pasta", 100, "g")],
      [currentPasta],
    );

    expect(draft.availableLines).toEqual([{ itemId: "pasta", quantity: "250" }]);
  });

  it("limits available lines to twenty snapshots", () => {
    const snapshots = Array.from({ length: 21 }, (_, index) => snapshot(`item-${index}`, `Producto ${index}`, 1, "ud"));
    const inventory: MealBuilderInventoryItem[] = snapshots.map((entry) => ({
      id: entry.source_inventory_item_id,
      name: entry.product_name,
      quantity: 2,
      unit: "ud",
      nutrition_basis: "per_unit",
      calories: 1,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
    }));

    const draft = createRepeatedMealBuilderDraft(meal, snapshots, inventory);

    expect(draft.availableLines).toHaveLength(20);
  });

  it("handles an empty snapshot list", () => {
    const draft = createRepeatedMealBuilderDraft(meal, [], [currentPasta]);

    expect(draft.availableLines).toEqual([]);
    expect(draft.unavailableItems).toEqual([]);
  });

  it("uses current inventory compatibility instead of the historical unit", () => {
    const draft = createRepeatedMealBuilderDraft(
      meal,
      [snapshot("pasta", "Pasta", 250, "kg")],
      [currentPasta],
    );

    expect(draft.availableLines).toEqual([{ itemId: "pasta", quantity: "250" }]);
  });

  it("does not copy historical macros into draft lines", () => {
    const draft = createRepeatedMealBuilderDraft(meal, [snapshot("pasta", "Pasta", 250, "g")], [currentPasta]);

    expect(draft.availableLines[0]).toEqual({ itemId: "pasta", quantity: "250" });
    expect(draft.availableLines[0]).not.toHaveProperty("calories");
    expect(draft.availableLines[0]).not.toHaveProperty("protein_g");
  });

  it("sorts unavailable items stably", () => {
    const draft = createRepeatedMealBuilderDraft(meal, [
      snapshot("b", "Yogur", 1, "ud"),
      snapshot("c", "Arroz", 1, "g"),
      snapshot("a", "Yogur", 1, "ud"),
    ], []);

    expect(draft.unavailableItems.map((item) => item.sourceInventoryItemId)).toEqual(["c", "a", "b"]);
  });
});

function snapshot(
  sourceInventoryItemId: string,
  productName: string,
  consumedQuantity: number | string,
  unit: string,
): RepeatedMealBuilderSnapshot {
  return {
    source_inventory_item_id: sourceInventoryItemId,
    product_name: productName,
    consumed_quantity: consumedQuantity,
    unit,
  };
}
