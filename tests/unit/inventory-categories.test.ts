import { describe, expect, it } from "vitest";

import {
  getInventoryCategoryLabel,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  isInventoryCategory,
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
});
