import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/inventory/page.tsx", "utf8");
const form = readFileSync("components/inventory/InventoryConsumeForm.tsx", "utf8");

describe("inventory unit equivalence page contract", () => {
  it("loads all relevant identities with one owner-scoped grouped query", () => {
    expect(page).toContain('.from("food_quantity_equivalences")');
    expect(page).toContain('.eq("user_id", user.id)');
    expect(page).toContain('.eq("measure_kind", "unit")');
    expect(page).toContain('.eq("user_confirmed", true)');
    expect(page).toContain('.eq("source", "user")');
    expect(page).toContain('.in("food_catalog_item_id", foodCatalogItemIds)');
  });

  it("keeps inventory usable when the optional equivalence query fails", () => {
    expect(page).toContain("if (equivalenceError)");
    expect(page).toContain("const confirmedMeasureSnapshot = item.food_catalog_item_id");
  });

  it("projects the private snapshot before crossing the client boundary", () => {
    expect(page).toContain("toInventoryUnitMeasureValue(confirmedMeasureSnapshot)");
    expect(page).toContain("confirmedUnitMeasure={confirmedMeasure}");
    expect(page).not.toMatch(/confirmedUnitMeasure=\{[^}]*unitMeasures\.get/s);
    expect(form).toContain("confirmedUnitMeasure?: InventoryUnitMeasureValue | null;");
    const props = form.slice(form.indexOf("type InventoryConsumeFormProps"), form.indexOf("function formatOptionalPreviewValue"));
    expect(props).not.toContain("id: string;\n  updatedAt");
    expect(props).not.toContain("updatedAt");
  });

  it("keeps only the public measure value and provides a review link", () => {
    expect(form).toContain('import type { InventoryUnitMeasureValue }');
    expect(form).toContain('href="/inventory/equivalences"');
    expect(form).not.toContain("variant_key");
    expect(form).not.toContain("food_catalog_item_id");
    expect(form).not.toContain("user_confirmed");
  });
});
