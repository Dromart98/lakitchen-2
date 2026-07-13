import { describe, expect, it } from "vitest";

import {
  getInventoryNutritionBasisLabel,
  hasInventoryNutritionValues,
  INVENTORY_NUTRITION_BASIS_LABELS,
  isInventoryNutritionBasis,
  NUTRITION_BASES,
  parseOptionalInventoryNutritionNumber,
} from "@/modules/inventory/inventory-nutrition";

describe("inventory nutrition bases", () => {
  it("accepts every valid nutrition basis", () => {
    for (const basis of NUTRITION_BASES) {
      expect(isInventoryNutritionBasis(basis)).toBe(true);
    }
  });

  it("rejects invalid nutrition bases", () => {
    expect(isInventoryNutritionBasis("")).toBe(false);
    expect(isInventoryNutritionBasis("per_serving")).toBe(false);
    expect(isInventoryNutritionBasis("PER_100G")).toBe(false);
    expect(isInventoryNutritionBasis(null)).toBe(false);
    expect(isInventoryNutritionBasis(100)).toBe(false);
  });

  it("returns Spanish labels for nutrition bases and null", () => {
    for (const basis of NUTRITION_BASES) {
      expect(getInventoryNutritionBasisLabel(basis)).toBe(INVENTORY_NUTRITION_BASIS_LABELS[basis]);
    }

    expect(getInventoryNutritionBasisLabel(null)).toBe("Sin base nutricional");
  });

  it("does not contain duplicate nutrition bases", () => {
    expect(new Set(NUTRITION_BASES).size).toBe(NUTRITION_BASES.length);
  });
});

describe("inventory nutrition number parsing", () => {
  it("parses empty values as null", () => {
    expect(parseOptionalInventoryNutritionNumber("")).toBeNull();
    expect(parseOptionalInventoryNutritionNumber("   ")).toBeNull();
    expect(parseOptionalInventoryNutritionNumber(null)).toBeNull();
  });

  it("accepts zero, integers, and decimals", () => {
    expect(parseOptionalInventoryNutritionNumber("0")).toBe(0);
    expect(parseOptionalInventoryNutritionNumber("245")).toBe(245);
    expect(parseOptionalInventoryNutritionNumber("22.5")).toBe(22.5);
  });

  it("rejects negatives, NaN, Infinity, and malformed values", () => {
    expect(Number.isNaN(parseOptionalInventoryNutritionNumber("-1"))).toBe(true);
    expect(Number.isNaN(parseOptionalInventoryNutritionNumber("NaN"))).toBe(true);
    expect(Number.isNaN(parseOptionalInventoryNutritionNumber("Infinity"))).toBe(true);
    expect(Number.isNaN(parseOptionalInventoryNutritionNumber("1e3"))).toBe(true);
    expect(Number.isNaN(parseOptionalInventoryNutritionNumber("12,5"))).toBe(true);
    expect(Number.isNaN(parseOptionalInventoryNutritionNumber("abc"))).toBe(true);
  });

  it("detects whether any nutrition value is present", () => {
    expect(hasInventoryNutritionValues([null, null, null, null])).toBe(false);
    expect(hasInventoryNutritionValues([null, 0, null, null])).toBe(true);
    expect(hasInventoryNutritionValues([null, 12.5, null, null])).toBe(true);
  });
});
