import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const inventoryPage = readFileSync("app/inventory/page.tsx", "utf8");
const inventoryAddCta = readFileSync("app/inventory/InventoryAddCta.tsx", "utf8");
const nutritionCta = readFileSync("app/inventory/InventoryNutritionCta.tsx", "utf8");
const nutritionControls = readFileSync(
  "components/inventory/InventoryNutritionAiControls.tsx",
  "utf8",
);
const appShell = readFileSync("components/layout/AppShell.tsx", "utf8");
const styles = readFileSync("app/styles.css", "utf8");

describe("inventory nutrition completion access", () => {
  it("uses the existing complete-nutrition helper and requires a nutrition basis", () => {
    expect(inventoryPage).toContain("hasCompleteInventoryNutritionValues(item)");
    expect(inventoryPage).toContain("Boolean(item.nutrition_basis)");
  });

  it("renders the direct action only for valid pending products and scopes its ids to the item", () => {
    expect(inventoryPage).toContain("!hasCompleteNutrition && hasValidItemId");
    expect(inventoryPage).toContain("<InventoryNutritionCta");
    expect(inventoryPage).toContain("inventory-manage-${item.id}");
    expect(inventoryPage).toContain("inventory-edit-${item.id}");
    expect(inventoryPage).toContain("inventory-nutrition-ai-${item.id}");
    expect(inventoryPage).toContain("inventory-nutrition-ai-button-${item.id}");
  });

  it("opens only the selected details controls and focuses the nutrition button without estimating", () => {
    expect(nutritionCta).toContain("manage.open = true");
    expect(nutritionCta).toContain("edit.open = true");
    expect(nutritionCta).toContain("nutritionButton?.focus");
    expect(nutritionCta).toContain('type="button"');
    expect(nutritionCta).toContain("aria-controls={nutritionControlId}");
    expect(nutritionCta).not.toContain("estimateInventoryNutritionAction");
  });

  it("keeps manual fields and the explicit AI calculation and overwrite controls", () => {
    expect(inventoryPage).toContain('name="calories"');
    expect(inventoryPage).toContain('name="protein_g"');
    expect(inventoryPage).toContain('name="carbs_g"');
    expect(inventoryPage).toContain('name="fat_g"');
    expect(nutritionControls).toContain("Calcular macros con IA");
    expect(nutritionControls).toContain("Sustituir valores con IA");
    expect(nutritionControls).toContain("controlId?: string");
    expect(nutritionControls).toContain("buttonId?: string");
  });
});

describe("inventory add-product labels", () => {
  it("keeps one button opener and a distinct submit action", () => {
    expect((inventoryPage.match(/>Añadir producto</g) ?? [])).toHaveLength(0);
    expect(inventoryPage).toContain("<InventoryAddCta");
    expect(inventoryAddCta).toContain('type="button"');
    expect(inventoryAddCta).toContain(">\n      Añadir producto\n    <");
    expect(inventoryPage).toContain("<strong>Nuevo producto</strong>");
    expect(inventoryPage).toContain("<PendingSubmitButton");
    expect(inventoryPage).toContain('idleLabel="Guardar producto"');
    expect(inventoryPage).toContain("action={addInventoryItemAction}");
  });
});

describe("inventory product expiration presentation", () => {
  it("renders the existing expiration label only for products with an expiration date", () => {
    const productCardStart = inventoryPage.indexOf('<li className="inventory-product"');
    const productCardEnd = inventoryPage.indexOf("{!hasCompleteNutrition", productCardStart);
    const productCard = inventoryPage.slice(productCardStart, productCardEnd);

    expect(productCard).toContain("{item.expires_at ? (");
    expect(productCard).toContain('<p className="inventory-product__expiration">');
    expect(productCard).toContain("formatInventoryExpirationLabel(");
    expect(productCard).toContain("item.expires_at,");
    expect(productCard).not.toContain("Sin fecha de caducidad");
    expect(productCard).toContain(") : null}");
  });
});

describe("inventory product card structure", () => {
  it("keeps compact structural regions and the primary product controls", () => {
    expect(inventoryPage).toContain('<li className="inventory-product"');
    expect(inventoryPage).toContain('className="inventory-product__main"');
    expect(inventoryPage).toContain('className="inventory-product__identity"');
    expect(inventoryPage).toContain('className="inventory-product__quantity"');
    expect(inventoryPage).toContain('className="inventory-category"');
    expect(inventoryPage).toContain('className="inventory-manage"');
    expect(inventoryPage).toContain("Descontar cantidad");
    expect(inventoryPage).toContain("Editar");
    expect(inventoryPage).toContain("Eliminar");
    expect(styles).toContain(".inventory-product__main");
    expect(styles).toContain(".inventory-product__actions");
    expect(styles).toContain(".inventory-product .meal-log-form");
  });
});

describe("authenticated brand and card styling", () => {
  it("wraps the reusable logo in an accessible dashboard Link", () => {
    expect(appShell).toContain('import Link from "next/link"');
    expect(appShell).toContain('className="app-shell__brand-link"');
    expect(appShell).toContain('href="/dashboard"');
    expect(appShell).toContain('aria-label="Ir a Inicio"');
    expect(appShell).toContain("<LaKitchenLogo");
    expect(styles).toContain(".app-shell__brand-link:focus-visible");
  });

  it("removes the global multicolor card stripe while retaining card surface styles", () => {
    expect(styles).not.toContain(".card::before");
    expect(styles).toContain("background: color-mix(in srgb, var(--card) 92%, transparent)");
    expect(styles).toContain("border: 1px solid color-mix(in srgb, var(--border) 90%, transparent)");
    expect(styles).toContain("border-radius: 28px");
  });
});
