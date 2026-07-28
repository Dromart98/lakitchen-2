import { describe, expect, it } from "vitest";
import {
  convertMeasuredFoodQuantity,
  selectFoodQuantityEquivalence,
  toFoodQuantityEquivalence,
  type FoodQuantityEquivalence,
} from "@/modules/units/food-quantity-equivalence";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  food_catalog_item_id: "00000000-0000-4000-8000-000000000002",
  measure_kind: "can",
  variant_key: "143-g",
  display_label: "Lata de 143 g",
  canonical_quantity: 143,
  canonical_unit: "g",
  source: "ai",
  user_confirmed: false,
  updated_at: "2026-07-28T12:00:00.000Z",
} as const;

function equivalence(overrides: Partial<FoodQuantityEquivalence> = {}): FoodQuantityEquivalence {
  return { ...toFoodQuantityEquivalence(row)!, ...overrides } as FoodQuantityEquivalence;
}

describe("food quantity equivalences", () => {
  it("sanitizes proposed and confirmed rows into explicit states", () => {
    expect(toFoodQuantityEquivalence(row)).toEqual(expect.objectContaining({ state: "proposed", source: "ai" }));
    expect(toFoodQuantityEquivalence({ ...row, source: "user", user_confirmed: true })).toEqual(
      expect.objectContaining({ state: "confirmed", source: "user" }),
    );
  });

  it.each([
    { id: "not-a-uuid" },
    { food_catalog_item_id: 2 },
    { measure_kind: "cup" },
    { variant_key: " Not-normalized" },
    { variant_key: "two--cans" },
    { display_label: " " },
    { canonical_quantity: 0 },
    { canonical_quantity: Number.NaN },
    { canonical_quantity: Number.POSITIVE_INFINITY },
    { canonical_unit: "kg" },
    { source: "scanner" },
    { source: "user", user_confirmed: false },
    { source: "ai", user_confirmed: true },
    { updated_at: "not-a-date" },
  ])("rejects corrupt rows: %o", (invalid) => {
    expect(toFoodQuantityEquivalence({ ...row, ...invalid })).toBeNull();
  });

  it("converts measures canonically and through the exact conversion core", () => {
    const can = equivalence();
    expect(convertMeasuredFoodQuantity(2, can)).toEqual({ quantity: 286, unit: "g" });
    expect(convertMeasuredFoodQuantity(2, can, "kg")).toEqual({ quantity: 0.286, unit: "kg" });
    expect(convertMeasuredFoodQuantity(0.5, equivalence({ canonicalQuantity: 250 }))).toEqual({ quantity: 125, unit: "g" });
    expect(convertMeasuredFoodQuantity(3, equivalence({ canonicalQuantity: 14, canonicalUnit: "ml" }))).toEqual({ quantity: 42, unit: "ml" });
    expect(convertMeasuredFoodQuantity(2, equivalence({ canonicalQuantity: 6, canonicalUnit: "ud" }))).toEqual({ quantity: 12, unit: "ud" });
  });

  it("rejects invalid counts, overflow, and incompatible dimensions", () => {
    const can = equivalence();
    expect(convertMeasuredFoodQuantity(0, can)).toBeNull();
    expect(convertMeasuredFoodQuantity(Number.POSITIVE_INFINITY, can)).toBeNull();
    expect(convertMeasuredFoodQuantity(Number.MAX_VALUE, equivalence({ canonicalQuantity: 2 }))).toBeNull();
    expect(convertMeasuredFoodQuantity(2, can, "ml")).toBeNull();
  });

  it("preserves decimals without rounding and does not mutate inputs", () => {
    const serving = Object.freeze(equivalence({ canonicalQuantity: 1.23456789 }));
    const snapshot = { ...serving };
    expect(convertMeasuredFoodQuantity(3, serving)).toEqual({ quantity: 3.7037036699999994, unit: "g" });
    expect(serving).toEqual(snapshot);
  });

  it("requires exact variants and preserves ambiguity for future review", () => {
    const first = equivalence({ variantKey: "143-g" });
    const second = equivalence({ id: "00000000-0000-4000-8000-000000000003", variantKey: "80-g" });
    const values = Object.freeze([first, second]);
    expect(selectFoodQuantityEquivalence(values, "can", "80-g")).toBe(second);
    expect(selectFoodQuantityEquivalence(values, "can", "missing")).toBeNull();
    expect(selectFoodQuantityEquivalence(values, "can")).toBeNull();
    expect(selectFoodQuantityEquivalence([first], "can")).toBe(first);
    expect(values).toEqual([first, second]);
  });
});
