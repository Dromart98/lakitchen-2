import { describe, expect, it } from "vitest";
import { getInventoryFoodIdentityUpdate } from "@/modules/inventory/inventory-food-identity";

const base = { currentName: "Arroz", currentFoodCatalogItemId: "rice-id", nextName: "Arroz", resolvedFoodCatalogItemId: null, hasCompleteNutrition: false };

describe("inventory identity editing", () => {
  it("preserves identity for non-identity changes", () => {
    expect(getInventoryFoodIdentityUpdate(base)).toEqual({});
  });
  it("clears identity when the name changes without a resolution", () => {
    expect(getInventoryFoodIdentityUpdate({ ...base, nextName: "Pollo" })).toEqual({ food_catalog_item_id: null });
  });
  it("replaces identity when the renamed food is explicitly resolved", () => {
    expect(getInventoryFoodIdentityUpdate({ ...base, nextName: "Pollo", resolvedFoodCatalogItemId: "chicken-id", hasCompleteNutrition: true })).toEqual({ food_catalog_item_id: "chicken-id" });
  });
  it("retains the safe current identity if catalog persistence fails during a macro correction", () => {
    expect(getInventoryFoodIdentityUpdate({ ...base, hasCompleteNutrition: true })).toEqual({ food_catalog_item_id: "rice-id" });
  });
});
