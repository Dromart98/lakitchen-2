import fs from "node:fs";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync("app/inventory/equivalences/page.tsx", "utf8");
const actions = fs.readFileSync("app/inventory/equivalences/actions.ts", "utf8");
const inventory = fs.readFileSync("app/inventory/page.tsx", "utf8");

describe("food equivalence management page contract", () => {
  it("is protected and explicitly scopes every data query to the user", () => {
    expect(page).toContain('requireAuthenticatedUser(supabase, "food quantity equivalences")');
    expect(page.match(/\.eq\("user_id", user\.id\)/g)).toHaveLength(3);
    expect(page).toContain('.not("food_catalog_item_id", "is", null)');
    expect(page).toContain('toFoodQuantityEquivalence(row)');
  });

  it("links from inventory without changing primary navigation", () => {
    expect(inventory).toContain('href="/inventory/equivalences"');
    expect(inventory).toContain("Medidas habituales");
  });

  it("renders accessible success, error, empty, review and deletion states", () => {
    for (const text of ["Pendiente de revisar", "Revisada por ti", "Todavía no hay alimentos preparados para guardar medidas", 'role="alert"', 'role="status"', "Eliminar medida", "Volver al inventario"]) expect(page).toContain(text);
    expect(page).not.toMatch(/>\s*(?:ai|barcode-memory|observed-package|user)\s*</);
  });

  it("writes only through the existing RPCs with optimistic timestamps", () => {
    expect(actions.match(/rpc\("save_confirmed_food_quantity_equivalence"/g)).toHaveLength(2);
    expect(actions).toContain('rpc("delete_food_quantity_equivalence"');
    expect(actions).toContain("p_expected_updated_at: null");
    expect(actions).toContain("p_expected_updated_at: updatedAt");
    expect(actions).toContain("revalidatePath(PATH)");
    expect(actions).not.toMatch(/\.from\("food_quantity_equivalences"\).*\.(?:insert|update|delete)/s);
    expect(actions).not.toContain("save_food_quantity_equivalence_proposal");
  });

  it("keeps immutable identifiers hidden and maps safe outcomes", () => {
    for (const field of ["id", "food_catalog_item_id", "measure_kind", "variant_key", "updated_at"]) expect(page).toContain(`name="${field}"`);
    for (const code of ["conflict", "food-unavailable", "validation", "save-failed", "delete-failed", "created", "reviewed", "deleted"]) expect(page + actions).toContain(code);
  });
});
