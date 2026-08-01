import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/recipes/page.tsx", "utf8");
const saved = readFileSync("components/recipes/SavedAiRecipes.tsx", "utf8");
const batches = readFileSync("components/recipes/CookedBatches.tsx", "utf8");
const createForm = readFileSync("components/recipes/SavedAiRecipeBatchForm.tsx", "utf8");
const actions = readFileSync("app/recipes/actions.ts", "utf8");

describe("cooked batch UI contract", () => {
  it("replaces the visible legacy saved-recipe flow and binds private creation data on the server", () => {
    expect(saved).not.toContain("SavedAiRecipeCookForm");
    expect(saved).toContain("SavedAiRecipeBatchForm");
    expect(page).toContain("createSavedAiRecipeCookedBatchUiAction.bind(null, recipe.id");
    expect(actions).toContain("createSavedAiRecipeCookedBatchAction({");
    expect(createForm).not.toMatch(/recipeId|measurementUpdatedAt|mealType/);
  });

  it("keeps batch identifiers and versions out of the public client projection", () => {
    expect(page).toContain("const { updatedAt, ...publicSnapshot } = snapshot");
    expect(batches).toContain('Omit<SavedAiRecipeCookedBatchSnapshot, "updatedAt">');
    expect(batches).not.toMatch(/batchId|user_id|source_recipe_id|meal_log_id|ledger|data-/);
    expect(batches).not.toMatch(/type="hidden"|href=.*batch/);
  });

  it("uses the shared calculator for remaining values and previews without inventory operations", () => {
    expect(batches.match(/calculateCookedBatchPortion/g)).toHaveLength(3);
    expect(batches).not.toMatch(/inventory|daily_meal_log_items|calorieBudget/);
    expect(page).toContain("consumeCookedBatchUiAction.bind");
  });

  it("includes accessible safe statuses, confirmation and duplicate-submit locks", () => {
    expect(createForm).toContain("Confirmo que quiero descontar");
    expect(createForm).toContain('role={result.kind === "error" ? "alert" : "status"}');
    expect(createForm).toContain("disabled={!confirmed || pending}");
    expect(batches).toContain('role={message.kind === "error" ? "alert" : "status"}');
    expect(batches).toContain("disabled={!valid || pending}");
  });
});
