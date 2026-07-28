import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve(process.cwd(), "app/shopping-list/actions.ts"), "utf8");

describe("shopping-list food identity actions", () => {
  it("creates manual entries without browser-authoritative identity", () => {
    const add = actions.slice(actions.indexOf("export async function addShoppingListItemAction"), actions.indexOf("export async function updateShoppingListItemAction"));
    expect(add).toContain("food_catalog_item_id: null");
    expect(add).not.toContain('formData.get("food_catalog_item_id")');
  });

  it("uses the hybrid resolver and compare-and-set filters after transfer", () => {
    const transfer = actions.slice(actions.indexOf("export async function transferShoppingListItemToInventoryAction"), actions.indexOf("export async function deleteShoppingListItemAction"));
    expect(transfer).toContain("resolveInventoryNutritionForUser");
    expect(transfer).toContain("planShoppingListTransferResolutionUpdate");
    expect(transfer).toContain('.is("nutrition_basis", null)');
    expect(transfer).toContain('.is("food_catalog_item_id", null)');
    expect(transfer).toContain('.eq("food_catalog_item_id", resolutionUpdate.expectedFoodCatalogItemId)');
    expect(transfer).not.toContain("estimateInventoryNutritionWithOpenAi");
  });
});
