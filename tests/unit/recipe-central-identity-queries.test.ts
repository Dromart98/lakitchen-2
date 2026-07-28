import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/recipes/page.tsx", "utf8");
const actions = readFileSync("app/recipes/actions.ts", "utf8");
const identitySelection = "food_catalog_item_id, food_catalog_items!inventory_items_food_owner_fk(normalized_name, aliases)";

describe("global recipe inventory identity queries", () => {
  it.each([["recipes page", page], ["cook action", actions]])("loads the same owner-scoped identity for the %s", (_name, source) => {
    expect(source).toContain(identitySelection);
    expect(source).toMatch(/\.from\("inventory_items"\)[\s\S]*?food_catalog_items!inventory_items_food_owner_fk\(normalized_name, aliases\)[\s\S]*?\.eq\("user_id", user\.id\)[\s\S]*?\.gt\("quantity", 0\)/);
    expect(source).toContain(".map(toRecipeInventoryItem)");
  });

  it("does not add private identity columns to global recipe queries", () => {
    for (const source of [page, actions]) {
      const templateSelect = source.match(/\.from\("recipe_templates"\)[\s\S]*?\.select\(([^\n]+)\)/)?.[1] ?? "";
      expect(templateSelect).not.toContain("food_catalog_item_id");
      expect(templateSelect).not.toContain("user_id");
    }
  });
});
