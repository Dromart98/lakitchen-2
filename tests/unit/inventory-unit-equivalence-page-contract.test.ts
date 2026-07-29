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
    expect(page).toContain("unitMeasures.get(item.food_catalog_item_id) ?? null");
  });

  it("passes only the minimal measure and provides a review link", () => {
    expect(form).toContain('canonicalQuantity: number;');
    expect(form).toContain('canonicalUnit: "g" | "ml";');
    expect(form).toContain('href="/inventory/equivalences"');
    expect(form).not.toContain("variant_key");
    expect(form).not.toContain("food_catalog_item_id");
    expect(form).not.toContain("user_confirmed");
  });
});
