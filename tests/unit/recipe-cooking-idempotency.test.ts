import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const actions = readFileSync("app/recipes/actions.ts", "utf8");
const page = readFileSync("app/recipes/page.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260815000000_make_meal_builder_consumption_idempotent.sql",
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

  it("calls the existing idempotent overload with server-resolved consumption lines", () => {
    expect(cookAction).toContain('rpc("consume_meal_builder_items_and_log_meal", {');
    expect(cookAction).toContain("p_request_id: requestId");
    expect(cookAction).toContain("p_lines: consumptionLines.lines");
    expect(cookAction).not.toContain('formData.get("lines")');
  });

  it("maps an idempotency conflict to the existing safe error", () => {
    expect(actions).toContain('if (error.message === "idempotency_conflict") return "consume-failed";');
  });

  it("serializes equivalent concurrent replays and retains the legacy overload", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("return v_existing.meal_log_id");
    expect(migration).toContain("message = 'idempotency_conflict'");
    expect(migration).toContain("p_meal_name, p_meal_type, p_lines");
    expect(migration).not.toContain("drop function public.consume_meal_builder_items_and_log_meal(text");
  });
});
