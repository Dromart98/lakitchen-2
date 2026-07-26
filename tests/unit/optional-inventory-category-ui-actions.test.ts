import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const inventoryPage = read("app/inventory/page.tsx");
const inventoryActions = read("app/inventory/actions.ts");
const barcodePage = read("app/inventory/barcodes/page.tsx");
const barcodeActions = read("app/inventory/barcodes/actions.ts");
const barcodeControls = read("app/inventory/BarcodeCatalogControls.tsx");

describe("optional inventory category UI and actions", () => {
  it("offers an enabled empty option in manual add and edit forms", () => {
    expect(inventoryPage.match(/<option value="">Sin categoría<\/option>/g)).toHaveLength(2);
    expect(inventoryPage).not.toMatch(/name="category"\s+required/);
    expect(inventoryPage).toContain('defaultValue={item.category ?? ""}');
  });

  it("persists the server-validated nullable category on insert and update", () => {
    expect(inventoryActions).toContain("validateOptionalInventoryCategory(formData.get(\"category\"))");
    expect(inventoryActions).toContain("category: category.value");
    expect(inventoryActions).toMatch(/\.insert\(\{[\s\S]*?user_id: user\.id,[\s\S]*?category,/);
    expect(inventoryActions).toMatch(/\.update\(\{[\s\S]*?category,/);
    expect(inventoryActions).toMatch(/\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)/);
  });

  it("renders, clears and reloads null remembered-product categories", () => {
    expect(barcodePage).toContain("getInventoryCategoryLabel(product.default_category)");
    expect(barcodePage).toContain('defaultValue={product.default_category ?? ""}');
    expect(barcodePage).toContain('<option value="">Sin categoría</option>');
    expect(barcodePage).not.toMatch(/name="default_category"\s+required/);
    expect(barcodeActions).toContain("default_category: defaultCategory");
    expect(barcodeActions).toMatch(/\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)/);
    expect(inventoryActions).toContain("category: data.default_category");
    expect(barcodeControls).toContain('[INVENTORY_ADD_FORM_FIELD_IDS.category]: product.category ?? ""');
  });
});
