import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync("app/inventory/page.tsx", "utf8");
const barcodeControls = readFileSync("app/inventory/BarcodeCatalogControls.tsx", "utf8");
const addCta = readFileSync("app/inventory/InventoryAddCta.tsx", "utf8");

describe("inventory section hierarchy", () => {
  it("makes products the primary section before the add-product tool", () => {
    expect(page.indexOf('<h2 id="inventory-products-title">Tus productos</h2>')).toBeLessThan(
      page.indexOf('<strong>Nuevo producto</strong>'),
    );
    expect(page).toContain('className="inventory-products"');
    expect(page).toContain("{filteredItems.length} visibles");
  });

  it("keeps GET filters inside the products section and opens them when active", () => {
    const productsStart = page.indexOf('className="inventory-products"');
    const filtersStart = page.indexOf('className="inventory-filters"');
    const addStart = page.indexOf('id="anadir-producto"');

    expect(filtersStart).toBeGreaterThan(productsStart);
    expect(filtersStart).toBeLessThan(addStart);
    expect(page).toContain('<details\n            className="inventory-filters"\n            open={hasActiveFilters}');
    expect(page).toContain('<strong>Encuentra rápido</strong>');
    expect(page).toContain("Busca y filtra tus productos");
    expect(page).toContain('action="/inventory"');
    expect(page).toContain('method="get"');
    expect(page).toContain('name="query"');
    expect(page).toContain('name="location"');
    expect(page).toContain('name="expiration"');
    expect(page).toContain('href="/inventory"');
    expect(page).toContain("Filtros activos");
  });

  it("keeps manual submission before the secondary barcode disclosure", () => {
    const formStart = page.indexOf('action={addInventoryItemAction}');
    const submit = page.indexOf("<PendingSubmitButton", formStart);
    const barcode = page.indexOf('className="inventory-action inventory-barcode"', formStart);

    expect(formStart).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(formStart);
    expect(barcode).toBeGreaterThan(submit);
    expect(page).toContain('<strong>Usar código de barras</strong>');
    expect(page).toContain("<BarcodeCatalogControls");
    expect(page).toContain('idleLabel="Guardar producto"');
    expect(barcodeControls).toContain('name="remember_barcode_product"');
    expect(barcodeControls).not.toContain("<form");
  });

  it("preserves the barcode form field and stops an active scanner when its disclosure closes", () => {
    expect(barcodeControls).toContain('name="barcode"');
    expect(barcodeControls).toContain('closest("details")');
    expect(barcodeControls).toContain('details.addEventListener("toggle", stopScannerWhenClosed)');
    expect(barcodeControls).toContain("if (!details.open) stopScanner()");
    expect(barcodeControls).toContain("getTracks().forEach((track) => track.stop())");
  });

  it("keeps the add CTA tied to the existing details and name field", () => {
    expect(addCta).toContain('getElementById("anadir-producto")');
    expect(addCta).toContain("details.open = true");
    expect(addCta).toContain("nameField?.focus");
  });
});
