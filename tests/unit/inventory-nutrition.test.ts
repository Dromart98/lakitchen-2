import { describe, expect, it } from "vitest";

import {
  calculateAvailableInventoryNutrition,
  calculateConsumedInventoryNutrition,
  formatInventoryNutritionTotalValue,
  getInventoryNutritionBasisLabel,
  hasCompleteInventoryNutritionValues,
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

describe("complete inventory nutrition values", () => {
  it("accepts complete finite non-negative nutrition values", () => {
    expect(hasCompleteInventoryNutritionValues({
      calories: 0,
      protein_g: 10,
      carbs_g: 20,
      fat_g: 5,
    })).toBe(true);
  });

  it("rejects missing, negative, and non-finite nutrition values", () => {
    expect(hasCompleteInventoryNutritionValues({
      calories: null,
      protein_g: 10,
      carbs_g: 20,
      fat_g: 5,
    })).toBe(false);
    expect(hasCompleteInventoryNutritionValues({
      calories: 100,
      protein_g: -1,
      carbs_g: 20,
      fat_g: 5,
    })).toBe(false);
    expect(hasCompleteInventoryNutritionValues({
      calories: 100,
      protein_g: 10,
      carbs_g: Number.NaN,
      fat_g: 5,
    })).toBe(false);
    expect(hasCompleteInventoryNutritionValues({
      calories: 100,
      protein_g: 10,
      carbs_g: 20,
      fat_g: Infinity,
    })).toBe(false);
  });
});

describe("available inventory nutrition totals", () => {
  it("uses factor 2.5 for 250 g with values per 100 g", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: 10,
      carbs_g: 4,
      fat_g: 2,
    })).toEqual({
      calories: 250,
      protein_g: 25,
      carbs_g: 10,
      fat_g: 5,
    });
  });

  it("uses factor 15 for 1.5 kg with values per 100 g", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 1.5,
      unit: "kg",
      calories: 100,
      protein_g: 10,
      carbs_g: 4,
      fat_g: 2,
    })).toEqual({
      calories: 1500,
      protein_g: 150,
      carbs_g: 60,
      fat_g: 30,
    });
  });

  it("uses factor 2.5 for 250 ml with values per 100 ml", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100ml",
      quantity: 250,
      unit: "ml",
      calories: 40,
      protein_g: 1,
      carbs_g: 8,
      fat_g: 0.5,
    })).toEqual({
      calories: 100,
      protein_g: 2.5,
      carbs_g: 20,
      fat_g: 1.25,
    });
  });

  it("uses factor 5 for 0.5 l and factor 15 for 1.5 l with values per 100 ml", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100ml",
      quantity: 0.5,
      unit: "l",
      calories: 40,
      protein_g: 1,
      carbs_g: 8,
      fat_g: 0.5,
    })).toEqual({
      calories: 200,
      protein_g: 5,
      carbs_g: 40,
      fat_g: 2.5,
    });

    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100ml",
      quantity: 1.5,
      unit: "l",
      calories: 40,
      protein_g: 1,
      carbs_g: 8,
      fat_g: 0.5,
    })).toEqual({
      calories: 600,
      protein_g: 15,
      carbs_g: 120,
      fat_g: 7.5,
    });
  });

  it("uses factor 3 for 3 units with values per unit", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_unit",
      quantity: 3,
      unit: "ud",
      calories: 120,
      protein_g: 8,
      carbs_g: 20,
      fat_g: 4,
    })).toEqual({
      calories: 360,
      protein_g: 24,
      carbs_g: 60,
      fat_g: 12,
    });
  });

  it("preserves null values when nutrition values are partial", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: 10,
      carbs_g: null,
      fat_g: null,
    })).toEqual({
      calories: 250,
      protein_g: 25,
      carbs_g: null,
      fat_g: null,
    });
  });

  it("returns null for incompatible nutrition basis and units", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 250,
      unit: "ud",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 250,
      unit: "ml",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 1,
      unit: "l",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_unit",
      quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_unit",
      quantity: 1.5,
      unit: "kg",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_unit",
      quantity: 250,
      unit: "ml",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_unit",
      quantity: 1,
      unit: "l",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    for (const unit of ["g", "kg", "ud", "cup"] as const) {
      expect(calculateAvailableInventoryNutrition({
        nutrition_basis: "per_100ml",
        quantity: 250,
        unit,
        calories: 100,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      })).toBeNull();
    }
  });

  it("returns null for missing basis, invalid quantities, and products without nutrition values", () => {
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: null,
      quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: Number.NaN,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: Infinity,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 0,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateAvailableInventoryNutrition({
      nutrition_basis: "per_100g",
      quantity: 250,
      unit: "g",
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
  });
});

describe("consumed inventory nutrition preview totals", () => {
  it("uses factor 2.5 for consuming 250 g with values per 100 g", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: 10,
      carbs_g: 4,
      fat_g: 2,
    })).toEqual({
      calories: 250,
      protein_g: 25,
      carbs_g: 10,
      fat_g: 5,
    });
  });

  it("uses factor 2.5 for consuming 0.25 kg with values per 100 g", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: 0.25,
      unit: "kg",
      calories: 100,
      protein_g: 10,
      carbs_g: 4,
      fat_g: 2,
    })).toEqual({
      calories: 250,
      protein_g: 25,
      carbs_g: 10,
      fat_g: 5,
    });
  });

  it("uses factor 2.5 for consuming 250 ml with values per 100 ml", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100ml",
      consumed_quantity: 250,
      unit: "ml",
      calories: 40,
      protein_g: 1,
      carbs_g: 8,
      fat_g: 0.5,
    })).toEqual({
      calories: 100,
      protein_g: 2.5,
      carbs_g: 20,
      fat_g: 1.25,
    });
  });

  it("uses factor 5 for consuming 0.5 l and factor 15 for consuming 1.5 l with values per 100 ml", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100ml",
      consumed_quantity: 0.5,
      unit: "l",
      calories: 40,
      protein_g: 1,
      carbs_g: 8,
      fat_g: 0.5,
    })).toEqual({
      calories: 200,
      protein_g: 5,
      carbs_g: 40,
      fat_g: 2.5,
    });

    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100ml",
      consumed_quantity: 1.5,
      unit: "l",
      calories: 40,
      protein_g: 1,
      carbs_g: 8,
      fat_g: 0.5,
    })).toEqual({
      calories: 600,
      protein_g: 15,
      carbs_g: 120,
      fat_g: 7.5,
    });
  });

  it("uses factor 3 for consuming 3 units with values per unit", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_unit",
      consumed_quantity: 3,
      unit: "ud",
      calories: 120,
      protein_g: 8,
      carbs_g: 20,
      fat_g: 4,
    })).toEqual({
      calories: 360,
      protein_g: 24,
      carbs_g: 60,
      fat_g: 12,
    });
  });

  it("preserves null values when consumed nutrition values are partial", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: 10,
      carbs_g: null,
      fat_g: null,
    })).toEqual({
      calories: 250,
      protein_g: 25,
      carbs_g: null,
      fat_g: null,
    });
  });

  it("returns null for incompatible consumed quantity units", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: 250,
      unit: "ud",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_unit",
      consumed_quantity: 250,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    for (const unit of ["g", "kg", "ud", "cup"] as const) {
      expect(calculateConsumedInventoryNutrition({
        nutrition_basis: "per_100ml",
        consumed_quantity: 250,
        unit,
        calories: 100,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      })).toBeNull();
    }
  });

  it("returns null for zero, negative, non-finite, and nutritionless consumed quantities", () => {
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: 0,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: -1,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: Number.NaN,
      unit: "g",
      calories: 100,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
    expect(calculateConsumedInventoryNutrition({
      nutrition_basis: "per_100g",
      consumed_quantity: 250,
      unit: "g",
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    })).toBeNull();
  });
});

describe("inventory nutrition total formatting", () => {
  it("removes unnecessary decimals and keeps at most one decimal", () => {
    expect(formatInventoryNutritionTotalValue(250)).toBe("250");
    expect(formatInventoryNutritionTotalValue(22.04)).toBe("22");
    expect(formatInventoryNutritionTotalValue(22.05)).toBe("22.1");
    expect(formatInventoryNutritionTotalValue(22.56)).toBe("22.6");
  });

  it("never formats unsafe values", () => {
    expect(formatInventoryNutritionTotalValue(null)).toBeNull();
    expect(formatInventoryNutritionTotalValue(Number.NaN)).toBeNull();
    expect(formatInventoryNutritionTotalValue(Infinity)).toBeNull();
  });
});
