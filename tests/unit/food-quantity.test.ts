import { describe, expect, it } from "vitest";
import {
  FOOD_QUANTITY_UNIT_DEFINITIONS,
  areFoodQuantityUnitsCompatible,
  convertFoodQuantity,
  convertFoodQuantityToCanonical,
  isFoodQuantityUnit,
} from "@/modules/units/food-quantity";

describe("food quantity exact conversions", () => {
  it("converts mass and volume in both directions", () => {
    expect(convertFoodQuantity(1, "kg", "g")).toBe(1000);
    expect(convertFoodQuantity(1000, "g", "kg")).toBe(1);
    expect(convertFoodQuantity(1, "l", "ml")).toBe(1000);
    expect(convertFoodQuantity(1000, "ml", "l")).toBe(1);
  });

  it("preserves positive quantities for identical units", () => {
    expect(convertFoodQuantity(2.75, "g", "g")).toBe(2.75);
    expect(convertFoodQuantity(3, "ud", "ud")).toBe(3);
  });

  it("rejects incompatible and unknown units", () => {
    expect(areFoodQuantityUnitsCompatible("kg", "g")).toBe(true);
    expect(areFoodQuantityUnitsCompatible("g", "ml")).toBe(false);
    expect(areFoodQuantityUnitsCompatible("ud", "g")).toBe(false);
    expect(convertFoodQuantity(1, "g", "ml")).toBeNull();
    expect(convertFoodQuantity(1, "ud", "kg")).toBeNull();
    expect(convertFoodQuantity(1, "oz", "g")).toBeNull();
    expect(isFoodQuantityUnit("oz")).toBe(false);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
    "rejects invalid quantity %s",
    (quantity) => expect(convertFoodQuantity(quantity, "g", "kg")).toBeNull(),
  );

  it("preserves decimals without rounding and converts to canonical units", () => {
    expect(convertFoodQuantity(1.23456789, "kg", "g")).toBeCloseTo(1234.56789, 10);
    expect(convertFoodQuantity(1.23456789, "l", "ml")).toBeCloseTo(1234.56789, 10);
    expect(convertFoodQuantityToCanonical(0.125, "kg")).toEqual({ quantity: 125, unit: "g" });
  });

  it("exposes immutable unit definitions", () => {
    expect(Object.isFrozen(FOOD_QUANTITY_UNIT_DEFINITIONS)).toBe(true);
    expect(Object.values(FOOD_QUANTITY_UNIT_DEFINITIONS).every(Object.isFrozen)).toBe(true);
    expect(() => {
      Object.assign(FOOD_QUANTITY_UNIT_DEFINITIONS.kg, { factor: 2 });
    }).toThrow();
    expect(convertFoodQuantity(1, "kg", "g")).toBe(1000);
  });
});
