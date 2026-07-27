import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve(process.cwd(), "app/inventory/actions.ts"), "utf8");

describe("inventory action identity propagation", () => {
  it("resolves confirmed manual or barcode nutrition before inserting stock", () => {
    const add = actions.slice(actions.indexOf("export async function addInventoryItemAction"), actions.indexOf("export async function updateInventoryItemAction"));
    expect(add.indexOf("cacheConfirmedInventoryNutrition")).toBeLessThan(add.indexOf('.from("inventory_items").insert'));
    expect(add).toContain("food_catalog_item_id: foodCatalogItemId");
    expect(add).toContain('source: rememberBarcode && barcodeValidation.ok ? "barcode-memory" : "user"');
    expect(add).toContain("externalId: barcodeValidation.ok ? barcodeValidation.barcode : null");
  });

  it("saves voice identities through the atomic RPC and remains best effort", () => {
    const voice = actions.slice(actions.indexOf("export async function saveVoiceInventoryBatchAction"));
    expect(voice.indexOf("persistConfirmedNutritionBatchWithIdentities")).toBeLessThan(voice.indexOf('rpc("save_voice_inventory_batch"'));
    expect(voice).toContain("food_catalog_item_id:");
    expect(voice).toContain("itemsWithIdentities");
    expect(voice).toContain("catch (error)");
  });
});
