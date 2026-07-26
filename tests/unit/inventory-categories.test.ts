import { describe, expect, it } from "vitest";

import {
  getInventoryCategoryLabel,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  isInventoryCategory,
  validateOptionalInventoryCategory,
} from "@/modules/inventory/inventory-categories";

describe("inventory categories", () => {
  it("accepts every valid inventory category", () => {
    for (const category of INVENTORY_CATEGORIES) {
      expect(isInventoryCategory(category)).toBe(true);
    }
  });

  it("rejects invalid inventory category values", () => {
    expect(isInventoryCategory("")).toBe(false);
    expect(isInventoryCategory("protein;drop table inventory_items")).toBe(false);
    expect(isInventoryCategory("Protein")).toBe(false);
    expect(isInventoryCategory(null)).toBe(false);
    expect(isInventoryCategory(123)).toBe(false);
  });

  it("returns Spanish labels for every category", () => {
    for (const category of INVENTORY_CATEGORIES) {
      expect(getInventoryCategoryLabel(category)).toBe(INVENTORY_CATEGORY_LABELS[category]);
    }
  });

  it("returns a safe label for uncategorized inventory items", () => {
    expect(getInventoryCategoryLabel(null)).toBe("Sin categoría");
  });

  it("does not contain duplicate categories", () => {
    expect(new Set(INVENTORY_CATEGORIES).size).toBe(INVENTORY_CATEGORIES.length);
  });

  it("normalizes an empty optional category to null", () => {
    expect(validateOptionalInventoryCategory("")).toEqual({ ok: true, value: null });
    expect(validateOptionalInventoryCategory("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts known optional categories and rejects unknown values", () => {
    expect(validateOptionalInventoryCategory(" vegetable ")).toEqual({ ok: true, value: "vegetable" });
    expect(validateOptionalInventoryCategory("snack")).toEqual({ ok: false });
    expect(validateOptionalInventoryCategory(123)).toEqual({ ok: false });
  });
});
