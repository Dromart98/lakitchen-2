import { describe, expect, it } from "vitest";

import {
  formatMealLogItemNutritionValue,
  getMealHistoryRepeatMode,
  sortMealLogItems,
  type MealHistoryRepeatModeInput,
  type MealLogItemRecord,
} from "@/modules/meals/meal-log-items";

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

describe("meal history repeat mode helper", () => {
  it("uses the composer for past meals with loaded snapshots", () => {
    expect(getMealHistoryRepeatMode({
      snapshotsLoadedSuccessfully: true,
      hasSnapshots: true,
      isPastMeal: true,
    })).toBe("composer");
  });

  it("uses the composer for current-day meals with loaded snapshots", () => {
    expect(getMealHistoryRepeatMode({
      snapshotsLoadedSuccessfully: true,
      hasSnapshots: true,
      isPastMeal: false,
    })).toBe("composer");
  });

  it("uses direct repeat for past meals without snapshots", () => {
    expect(getMealHistoryRepeatMode({
      snapshotsLoadedSuccessfully: true,
      hasSnapshots: false,
      isPastMeal: true,
    })).toBe("direct");
  });

  it("hides repeat actions for current-day meals without snapshots", () => {
    expect(getMealHistoryRepeatMode({
      snapshotsLoadedSuccessfully: true,
      hasSnapshots: false,
      isPastMeal: false,
    })).toBe("none");
  });

  it("hides repeat actions for past meals when snapshots fail to load", () => {
    expect(getMealHistoryRepeatMode({
      snapshotsLoadedSuccessfully: false,
      hasSnapshots: false,
      isPastMeal: true,
    })).toBe("none");
  });

  it("hides repeat actions for possible snapshot meals when snapshots fail to load", () => {
    expect(getMealHistoryRepeatMode({
      snapshotsLoadedSuccessfully: false,
      hasSnapshots: true,
      isPastMeal: true,
    })).toBe("none");
  });

  it("only returns supported repeat modes", () => {
    const supportedModes = new Set(["composer", "direct", "none"]);
    const cases: MealHistoryRepeatModeInput[] = [
      { snapshotsLoadedSuccessfully: true, hasSnapshots: true, isPastMeal: true },
      { snapshotsLoadedSuccessfully: true, hasSnapshots: true, isPastMeal: false },
      { snapshotsLoadedSuccessfully: true, hasSnapshots: false, isPastMeal: true },
      { snapshotsLoadedSuccessfully: true, hasSnapshots: false, isPastMeal: false },
      { snapshotsLoadedSuccessfully: false, hasSnapshots: true, isPastMeal: true },
      { snapshotsLoadedSuccessfully: false, hasSnapshots: false, isPastMeal: false },
    ];

    expect(cases.map(getMealHistoryRepeatMode).every((mode) => supportedModes.has(mode))).toBe(true);
  });

  it("does not mutate its input", () => {
    const input: MealHistoryRepeatModeInput = {
      snapshotsLoadedSuccessfully: true,
      hasSnapshots: false,
      isPastMeal: true,
    };
    const before = { ...input };

    getMealHistoryRepeatMode(input);

    expect(input).toEqual(before);
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
