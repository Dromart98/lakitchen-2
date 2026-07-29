import { describe, expect, it } from "vitest";
import {
  convertMeasuredFoodQuantity,
  selectFoodQuantityEquivalence,
  toFoodQuantityEquivalence,
  type FoodQuantityEquivalence,
} from "@/modules/units/food-quantity-equivalence";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  food_catalog_item_id: "22222222-2222-4222-8222-222222222222",
  measure_kind: "can",
  variant_key: "143-g",
  display_label: "Lata de 143 g",
  canonical_quantity: 143,
  canonical_unit: "g",
  source: "ai",
  user_confirmed: false,
  updated_at: "2026-08-03T10:00:00.000Z",
};

function equivalence(overrides: Partial<typeof row> = {}): FoodQuantityEquivalence {
  const parsed = toFoodQuantityEquivalence({ ...row, ...overrides });
  if (!parsed) throw new Error("invalid test fixture");
  return parsed;
}

describe("food quantity equivalences", () => {
  it("sanitizes proposals and confirmed rows into explicit states", () => {
    expect(equivalence()).toMatchObject({ state: "proposed", source: "ai", userConfirmed: false });
    expect(equivalence({ source: "user", user_confirmed: true })).toMatchObject({
      state: "confirmed", source: "user", userConfirmed: true,
    });
  });

  it.each([
    { id: "bad" },
    { food_catalog_item_id: "bad" },
    { measure_kind: "cup" },
    { variant_key: "Two Cans" },
    { variant_key: "two--cans" },
    { display_label: " label" },
    { display_label: "" },
    { canonical_quantity: 0 },
    { canonical_quantity: Number.NaN },
    { canonical_quantity: Number.POSITIVE_INFINITY },
    { canonical_unit: "kg" },
    { source: "unknown" },
    { source: "user", user_confirmed: false },
    { source: "ai", user_confirmed: true },
    { updated_at: "not-a-date" },
  ])("rejects corrupt row %#", (override) => {
    expect(toFoodQuantityEquivalence({ ...row, ...override })).toBeNull();
  });

  it("converts canonical measures and exact target units without rounding", () => {
    expect(convertMeasuredFoodQuantity(2, equivalence())).toEqual({ quantity: 286, unit: "g" });
    expect(convertMeasuredFoodQuantity(2, equivalence(), "kg")).toEqual({ quantity: 0.286, unit: "kg" });
    expect(convertMeasuredFoodQuantity(0.5, equivalence({ measure_kind: "serving", canonical_quantity: 250 })))
      .toEqual({ quantity: 125, unit: "g" });
    expect(convertMeasuredFoodQuantity(3, equivalence({ measure_kind: "tablespoon", canonical_quantity: 14, canonical_unit: "ml" })))
      .toEqual({ quantity: 42, unit: "ml" });
    expect(convertMeasuredFoodQuantity(2, equivalence({ measure_kind: "package", canonical_quantity: 6, canonical_unit: "ud" })))
      .toEqual({ quantity: 12, unit: "ud" });
    expect(convertMeasuredFoodQuantity(0.123456789, equivalence({ canonical_quantity: 3 })))
      .toEqual({ quantity: 0.370370367, unit: "g" });
  });

  it("rejects invalid counts, overflow, and incompatible target dimensions", () => {
    expect(convertMeasuredFoodQuantity(0, equivalence())).toBeNull();
    expect(convertMeasuredFoodQuantity(Number.POSITIVE_INFINITY, equivalence())).toBeNull();
    expect(convertMeasuredFoodQuantity(Number.MAX_VALUE, equivalence())).toBeNull();
    expect(convertMeasuredFoodQuantity(2, equivalence(), "ml")).toBeNull();
  });

  it("requires an exact variant and preserves input immutability", () => {
    const first = equivalence();
    const second = equivalence({ variant_key: "80-g", canonical_quantity: 80 });
    const items = Object.freeze([first, second]);
    expect(selectFoodQuantityEquivalence(items, "can")).toBeNull();
    expect(selectFoodQuantityEquivalence(items, "can", "80-g")).toBe(second);
    expect(selectFoodQuantityEquivalence(items, "can", "missing")).toBeNull();
    expect(items).toEqual([first, second]);
  });
});
