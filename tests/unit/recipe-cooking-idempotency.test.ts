import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const actions = readFileSync("app/recipes/actions.ts", "utf8");
const page = readFileSync("app/recipes/page.tsx", "utf8");
const mealBuilderMigration = readFileSync(
  "supabase/migrations/20260815000000_make_meal_builder_consumption_idempotent.sql",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260815030000_make_catalog_recipe_cooking_replayable.sql",
  "utf8",
);
const cookAction = actions.slice(
  actions.indexOf("export async function cookRecipeAndLogMealAction"),
  actions.indexOf("type RecipeAiSupabaseQueryBuilder"),
);

describe("catalog recipe cooking idempotency contract", () => {
  it("renders a stable request ID for each cooking form", () => {
    expect(page).toContain('name="request_id" value={crypto.randomUUID()}');
  });

  it("validates the submitted request ID before loading or mutating data", () => {
    const validation = cookAction.indexOf('UUID_PATTERN.test(requestId)');
    const clientCreation = cookAction.indexOf("await createClient()");

    expect(cookAction).toContain('formData.get("request_id")');
    expect(validation).toBeGreaterThan(0);
    expect(validation).toBeLessThan(clientCreation);
  });

  it("probes for a completed replay after authentication and before mutable reads", () => {
    const authentication = cookAction.indexOf("await requireAuthenticatedUser");
    const probe = cookAction.indexOf('rpc("probe_catalog_recipe_cooking_request"');
    const inventoryRead = cookAction.indexOf('.from("inventory_items")');

    expect(authentication).toBeGreaterThan(0);
    expect(probe).toBeGreaterThan(authentication);
    expect(probe).toBeLessThan(inventoryRead);
    expect(cookAction).toContain("if (replayedMealId)");
    expect(cookAction.indexOf("redirectWithRecipeSuccess(mode)", probe)).toBeLessThan(inventoryRead);
  });

  it("calls the catalog recipe finalizer with server-resolved consumption lines", () => {
    expect(cookAction).toContain('rpc("consume_catalog_recipe_and_log_meal", {');
    expect(cookAction).toContain("p_request_id: requestId");
    expect(cookAction).toContain("p_recipe_id: recipeId");
    expect(cookAction).toContain("p_servings: requestedServings");
    expect(cookAction).toContain("p_lines: consumptionLines.lines");
    expect(cookAction).not.toContain('formData.get("lines")');
  });

  it("maps an idempotency conflict to the existing safe error", () => {
    expect(actions).toContain('if (error.message === "idempotency_conflict") return "consume-failed";');
  });

  it("fingerprints only the stable logical catalog recipe request", () => {
    expect(migration.match(/'operation', 'catalog_recipe'/g)).toHaveLength(2);
    expect(migration.match(/'recipe_id', p_recipe_id/g)).toHaveLength(2);
    expect(migration.match(/'servings', p_servings/g)).toHaveLength(2);
    expect(migration.match(/'meal_type', p_meal_type/g)).toHaveLength(2);
    const fingerprintBlocks = migration.match(/v_fingerprint :=[\s\S]*?\), 'hex'\);/g) ?? [];
    expect(fingerprintBlocks).toHaveLength(2);
    for (const fingerprint of fingerprintBlocks) {
      expect(fingerprint).not.toContain("p_lines");
      expect(fingerprint).not.toContain("p_meal_name");
    }
  });

  it("serializes probe and final calls and handles replay and conflict", () => {
    expect(migration.match(/pg_catalog\.pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(migration).toContain("return null");
    expect(migration).toContain("return v_existing.meal_log_id");
    expect(migration).toContain("message = 'idempotency_conflict'");
  });

  it("performs the first consumption and ledger insert atomically in the final RPC", () => {
    const legacyConsumption = migration.indexOf("v_meal_log_id := public.consume_meal_builder_items_and_log_meal");
    const ledgerInsert = migration.indexOf("insert into public.meal_builder_consumption_requests", legacyConsumption);
    expect(legacyConsumption).toBeGreaterThan(0);
    expect(ledgerInsert).toBeGreaterThan(legacyConsumption);
    expect(migration.slice(legacyConsumption, ledgerInsert)).not.toContain("commit");
    expect(migration).not.toContain("pending");
  });

  it("secures the new RPCs and retains both existing overloads", () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("Untrusted catalog recipe cooking RPC owner");
    expect(migration).toContain("grant execute on function public.probe_catalog_recipe_cooking_request(uuid, uuid, integer, text) to authenticated");
    expect(migration).toContain("grant execute on function public.consume_catalog_recipe_and_log_meal(uuid, uuid, integer, text, text, jsonb) to authenticated");
    expect(mealBuilderMigration).toContain("p_meal_name, p_meal_type, p_lines");
    expect(migration).not.toContain("drop function public.consume_meal_builder_items_and_log_meal");
  });
});
