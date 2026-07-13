import { describe, expect, it } from "vitest";

import { formatMealLogItemNutritionValue, sortMealLogItems, type MealLogItemRecord } from "@/modules/meals/meal-log-items";

describe("meal log item presentation helpers", () => {
  it("formats integer values", () => {
    expect(formatMealLogItemNutritionValue(42)).toBe("42");
  });

  it("formats values with one decimal", () => {
    expect(formatMealLogItemNutritionValue(42.5)).toBe("42,5");
  });

  it("rounds values with more than one decimal", () => {
    expect(formatMealLogItemNutritionValue(42.56)).toBe("42,6");
  });

  it("hides NaN values", () => {
    expect(formatMealLogItemNutritionValue(Number.NaN)).toBe("—");
  });

  it("hides Infinity values", () => {
    expect(formatMealLogItemNutritionValue(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("sorts by product_name", () => {
    const sorted = sortMealLogItems([
      item("2", "Zanahoria"),
      item("1", "Arroz"),
    ]);

    expect(sorted.map((entry) => entry.product_name)).toEqual(["Arroz", "Zanahoria"]);
  });

  it("uses source_inventory_item_id as a stable tie breaker", () => {
    const sorted = sortMealLogItems([
      item("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Pollo"),
      item("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "Pollo"),
    ]);

    expect(sorted.map((entry) => entry.source_inventory_item_id)).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
  });

  it("returns an empty list for an empty list", () => {
    expect(sortMealLogItems([])).toEqual([]);
  });

  it("preserves decimal nutrition values for presentation", () => {
    expect(formatMealLogItemNutritionValue("12.34")).toBe("12,3");
  });

  it("does not convert unknown values to zero", () => {
    expect(formatMealLogItemNutritionValue(null)).toBe("—");
    expect(formatMealLogItemNutritionValue(undefined)).toBe("—");
  });
});

function item(sourceInventoryItemId: string, productName: string): MealLogItemRecord {
  return {
    source_inventory_item_id: sourceInventoryItemId,
    product_name: productName,
    consumed_quantity: 1,
    unit: "g",
    calories: 1,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
  };
}
