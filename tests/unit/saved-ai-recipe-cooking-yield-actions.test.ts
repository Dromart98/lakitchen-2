import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("app/recipes/actions.ts", "utf8");
const save = actions.slice(actions.indexOf("export async function saveSavedRecipeCookingYieldAction"), actions.indexOf("export async function deleteSavedRecipeCookingYieldAction"));
const remove = actions.slice(actions.indexOf("export async function deleteSavedRecipeCookingYieldAction"), actions.indexOf("type CookSavedAiRecipeSupabaseQueryBuilder"));

describe("saved recipe cooking yield server action contract", () => {
  it("validates before authentication and reconstructs ownership server-side", () => {
    expect(save.indexOf("parseSavedRecipeCookingYieldMeasurement(input)")).toBeLessThan(save.indexOf("createClient()"));
    expect(save).toContain("requireAuthenticatedUser");
    expect(save).toContain('.from("user_saved_ai_recipes")');
    expect(save).toContain('.eq("user_id", user.id)');
    expect(save).toContain("user_id: user.id");
  });

  it("creates or explicitly updates the single current measurement", () => {
    expect(save).toContain('.from("user_saved_ai_recipe_cooking_yields").insert(values)');
    expect(save).toContain('.from("user_saved_ai_recipe_cooking_yields").update(values)');
    expect(save).not.toMatch(/calories|protein_g|carbs_g|fat_g|yield_factor|inventory_item/);
  });

  it("authenticates, checks recipe ownership and scopes deletion", () => {
    expect(remove).toContain("requireAuthenticatedUser");
    expect(remove).toContain('.from("user_saved_ai_recipes")');
    expect(remove).toContain('.eq("id", recipeId).eq("user_id", user.id)');
    expect(remove).toContain('.delete().eq("recipe_id", recipeId).eq("user_id", user.id)');
  });
});
