import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/recipes/page.tsx", "utf8");
const preview = readFileSync("components/recipes/CookingYieldPreview.tsx", "utf8");
const projection = readFileSync("modules/recipes/saved-ai-recipe-cooking-yield.ts", "utf8");

describe("saved AI recipe cooking yield RSC contract", () => {
  it("projects only public totals or an incomplete review count to the client", () => {
    expect(page).toContain("buildSavedRecipeCookingYieldNutrition(recipe, aiInventoryById)");
    expect(preview).toContain("initialMeasurement: SavedRecipeCookingYieldMeasurement | null");
    expect(projection).toContain('status: "complete"; total: Readonly<NutritionTotals>');
    expect(projection).toContain('status: "incomplete"; itemsToReview: number');
    expect(preview).not.toMatch(/food_catalog_item_id|confirmedUnitMeasure|measure_kind|updated_at|expires_at|snapshot/i);
  });

  it("keeps state inside each keyed recipe preview and starts closed", () => {
    expect(preview).toContain("useState<Fields>(() => fieldsFromMeasurement(initialMeasurement))");
    expect(preview).toContain("calculateResult(initialMeasurement, nutrition)");
    expect(preview).toContain("<details className=");
    expect(preview).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });

  it("reuses the deterministic calculator and does not persist", () => {
    expect(preview).toContain("calculateCookingYield({");
    expect(page).toContain('.select("recipe_id, raw_weight_g, cooked_weight_g, servings")');
    expect(page).not.toContain("user_id: user.id, cookingYieldNutrition");
    expect(preview).not.toMatch(/action=|fetch\(|supabase|router\.refresh|revalidate/i);
  });
});
