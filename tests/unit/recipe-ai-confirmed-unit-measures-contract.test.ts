import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("app/recipes/actions.ts", "utf8");
const helper = readFileSync("modules/recipes/recipe-ai-unit-measures.server.ts", "utf8");
const generator = readFileSync("modules/recipes/recipe-ai-generation.ts", "utf8");
const savedRecipes = readFileSync("components/recipes/SavedAiRecipes.tsx", "utf8");

describe("AI recipe confirmed unit measure contract", () => {
  it("enriches all four AI recipe actions through one grouped owner-scoped helper", () => {
    expect(actions.match(/loadAndAttachRecipeAiUnitMeasures\(/g)).toHaveLength(4);
    expect(actions.match(/food_catalog_item_id"\)/g)).toHaveLength(4);
    expect(helper).toContain('.from("food_quantity_equivalences")');
    expect(helper).toContain('.eq("user_id", userId)');
    expect(helper).toContain('.eq("measure_kind", "unit")');
    expect(helper).toContain('.eq("user_confirmed", true)');
    expect(helper).toContain('.eq("source", "user")');
    expect(helper).toContain('.in("food_catalog_item_id", identityIds)');
    expect(helper).toContain("selectInventoryUnitMeasures(data ?? [], userId, identityIds)");
  });

  it("discards optional-query data on error and keeps private snapshots off clients", () => {
    expect(helper).toContain("return attachRecipeAiUnitMeasures(items, new Map())");
    expect(generator).toContain("id: item.id");
    expect(generator).not.toMatch(/items[\s\S]*food_catalog_item_id:/);
    expect(savedRecipes).toContain("usesConfirmedUnitMeasure: boolean");
    expect(savedRecipes).not.toContain("confirmedUnitMeasure");
    expect(savedRecipes).not.toContain("updatedAt");
  });
});
