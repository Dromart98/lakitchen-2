import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const component = readFileSync("components/recipes/RecipeAiGenerator.tsx", "utf8");
const actions = readFileSync("app/recipes/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260815040000_make_generated_ai_recipe_cooking_replayable.sql", "utf8");
const action = actions.slice(actions.indexOf("export async function cookGeneratedRecipeAndLogMealAction"));

describe("generated AI recipe cooking idempotency", () => {
  it("keeps an independent request ID per suggestion and rotates it with meal type", () => {
    expect(component).toContain("[String(index), crypto.randomUUID()]");
    expect(component).toContain("request_id: cookRequestIds[suggestionId]");
    expect(component).toContain("[suggestionId]: crypto.randomUUID()");
    expect(component).not.toContain("request_id: crypto.randomUUID()");
  });

  it("validates/authenticates, fingerprints canonically, and probes before mutable reads", () => {
    const parse = action.indexOf("parseRecipeAiCookRequest(input)");
    const auth = action.indexOf("await requireAuthenticatedUser");
    const fingerprint = action.indexOf("createSavedAiRecipeFingerprint(request.recipe)");
    const probe = action.indexOf('rpc("probe_generated_ai_recipe_cooking_request"');
    const inventory = action.indexOf('.from("inventory_items")');
    expect(parse).toBeGreaterThanOrEqual(0);
    expect(parse).toBeLessThan(auth);
    expect(auth).toBeLessThan(fingerprint);
    expect(fingerprint).toBeLessThan(probe);
    expect(probe).toBeLessThan(inventory);
    expect(action.indexOf("if (replayedMealId)")).toBeLessThan(inventory);
  });

  it("passes only server-resolved lines to the atomic finalizer", () => {
    expect(action).toContain('rpc("consume_generated_ai_recipe_and_log_meal"');
    expect(action).toContain("p_lines: consumptionLines.lines");
    expect(action).not.toContain("request.recipe.lines");
  });

  it("uses logical fingerprints, locks retries, and atomically records first success", () => {
    expect(migration.match(/'operation', 'generated_ai_recipe'/g)).toHaveLength(2);
    expect(migration.match(/'recipe_fingerprint', p_recipe_fingerprint/g)).toHaveLength(2);
    expect(migration.match(/'meal_type', p_meal_type/g)).toHaveLength(2);
    expect(migration.match(/pg_catalog\.pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(migration).toContain("return v_existing.meal_log_id");
    expect(migration).toContain("message = 'idempotency_conflict'");
    const legacy = migration.indexOf("v_meal_log_id := public.consume_meal_builder_items_and_log_meal");
    const ledger = migration.indexOf("insert into public.meal_builder_consumption_requests", legacy);
    expect(legacy).toBeGreaterThan(0);
    expect(ledger).toBeGreaterThan(legacy);
    expect(migration.slice(legacy, ledger)).not.toContain("commit");
    expect(migration).not.toContain("pending");
  });

  it("secures both new RPCs without replacing legacy signatures", () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("Untrusted generated AI recipe cooking RPC owner");
    expect(migration).toContain("grant execute on function public.probe_generated_ai_recipe_cooking_request(uuid, text, text) to authenticated");
    expect(migration).toContain("grant execute on function public.consume_generated_ai_recipe_and_log_meal(uuid, text, text, text, jsonb) to authenticated");
    expect(migration).not.toContain("drop function");
  });
});
