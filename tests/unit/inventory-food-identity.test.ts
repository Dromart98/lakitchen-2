import { describe, expect, it } from "vitest";
import { planInventoryFoodIdentityUpdate } from "@/modules/inventory/inventory-food-identity";

const base = { currentName: "Arroz", currentFoodCatalogItemId: "rice-id", nextName: "Arroz", explicitlyResolvedFoodCatalogItemId: null, hasCompleteNutrition: false };

describe("inventory identity editing", () => {
  it("preserves identity for non-identity changes", () => {
    expect(planInventoryFoodIdentityUpdate(base)).toEqual({ shouldPersistConfirmedNutrition: false, catalogFoodCatalogItemId: "rice-id", fallbackFoodCatalogItemId: "rice-id" });
  });
  it("clears identity when the name changes without a resolution", () => {
    expect(planInventoryFoodIdentityUpdate({ ...base, nextName: "Pollo", hasCompleteNutrition: true })).toEqual({ shouldPersistConfirmedNutrition: false, catalogFoodCatalogItemId: null, fallbackFoodCatalogItemId: null });
  });
  it("replaces identity when the renamed food is explicitly resolved", () => {
    expect(planInventoryFoodIdentityUpdate({ ...base, nextName: "Pollo", explicitlyResolvedFoodCatalogItemId: "chicken-id", hasCompleteNutrition: true })).toEqual({ shouldPersistConfirmedNutrition: true, catalogFoodCatalogItemId: "chicken-id", fallbackFoodCatalogItemId: "chicken-id" });
  });
  it("retains the safe current identity if catalog persistence fails during a macro correction", () => {
    expect(planInventoryFoodIdentityUpdate({ ...base, hasCompleteNutrition: true })).toEqual({ shouldPersistConfirmedNutrition: true, catalogFoodCatalogItemId: "rice-id", fallbackFoodCatalogItemId: "rice-id" });
  });

  it("clears a renamed identity when nutrition is incomplete and unresolved", () => {
    expect(planInventoryFoodIdentityUpdate({ ...base, nextName: "Pollo" })).toEqual({ shouldPersistConfirmedNutrition: false, catalogFoodCatalogItemId: null, fallbackFoodCatalogItemId: null });
  });
});
