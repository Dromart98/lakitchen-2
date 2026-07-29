import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const actions = readFileSync("app/inventory/actions.ts", "utf8");
const addAction = actions.slice(actions.indexOf("export async function addInventoryItemAction"), actions.indexOf("export async function updateInventoryItemAction"));

describe("inventory barcode package memory persistence", () => {
  it("keeps inventory, remembered barcode, server lookup and proposal in order", () => {
    expect(addAction.indexOf('.from("inventory_items").insert')).toBeLessThan(addAction.indexOf('.from("user_barcode_products")'));
    expect(addAction.indexOf('.from("user_barcode_products")')).toBeLessThan(addAction.indexOf("lookupOpenFoodFactsProduct(barcodeValidation.barcode)"));
    expect(addAction.indexOf("lookupOpenFoodFactsProduct(barcodeValidation.barcode)")).toBeLessThan(addAction.indexOf('rpc("save_food_quantity_equivalence_proposal"'));
  });

  it("uses the server result and barcode identity, never editable form quantity or unit", () => {
    const proposalBlock = addAction.slice(addAction.indexOf("const external = await lookupOpenFoodFactsProduct"), addAction.indexOf("revalidatePath(INVENTORY_PATH)", addAction.indexOf("const external = await lookupOpenFoodFactsProduct")));
    expect(proposalBlock).toContain("external.product.package");
    expect(proposalBlock).toContain("barcode: barcodeValidation.barcode");
    expect(proposalBlock).not.toMatch(/formData|default_quantity|default_unit/);
  });

  it("only uses the proposal RPC with package and barcode-memory", () => {
    expect(addAction).toContain('rpc("save_food_quantity_equivalence_proposal"');
    expect(addAction).toContain("p_measure_kind: proposal.measureKind");
    expect(addAction).toContain('p_source: "barcode-memory"');
    expect(addAction).not.toMatch(/from\(["']food_quantity_equivalences["']\)/);
  });

  it("skips absent identity, not-found and absent package without treating them as failures", () => {
    expect(addAction).toContain("if (foodCatalogItemId)");
    expect(addAction).toContain('external.status === "provider-error"');
    expect(addAction).toContain('external.status === "found" && external.product.package');
    expect(addAction).not.toContain('external.status === "not-found"');
  });

  it("protects saved inventory and barcode on provider, unexpected or RPC failures", () => {
    expect(addAction.indexOf("proposalFailed = true")).toBeGreaterThan(addAction.indexOf('.from("user_barcode_products")'));
    expect(addAction).toContain("if (proposalError)");
    expect(addAction).toContain("catch (proposalError)");
    expect(addAction).toContain("item-created-barcode-measure-failed");
    expect(addAction).toContain("revalidatePath(INVENTORY_EQUIVALENCES_PATH)");
  });

  it("does not adopt the proposal for inventory or barcode defaults", () => {
    const inventoryInsert = addAction.slice(addAction.indexOf('.from("inventory_items").insert'), addAction.indexOf("if (error)"));
    const barcodeUpsert = addAction.slice(addAction.indexOf('.from("user_barcode_products")'), addAction.indexOf("if (barcodeError"));
    expect(inventoryInsert).not.toContain("proposal.");
    expect(barcodeUpsert).not.toContain("proposal.");
  });
});
