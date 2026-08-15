import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815000000_make_meal_builder_consumption_idempotent.sql"),
  "utf8",
);
const action = readFileSync(resolve(process.cwd(), "app/meal-builder/actions.ts"), "utf8");
const builder = readFileSync(resolve(process.cwd(), "components/meals/InventoryMealBuilder.tsx"), "utf8");

describe("meal builder idempotency contract", () => {
  it("creates one stable client request ID and sends it through the server action", () => {
    expect(builder).toContain("setRequestId(crypto.randomUUID())");
    expect(builder).toContain('name="request_id"');
    expect(action).toContain('formData.get("request_id")');
    expect(action).toContain("p_request_id: requestId");
  });

  it("stores and reuses the first successful result for an identical replay", () => {
    expect(migration).toContain("primary key (user_id, request_id)");
    expect(migration).toContain("return v_existing.meal_log_id");
    expect(migration.match(/public\.consume_meal_builder_items_and_log_meal\(/g)).toHaveLength(6);
  });

  it("rejects a changed normalized payload without invoking the consumption implementation", () => {
    const conflict = migration.indexOf("message = 'idempotency_conflict'");
    const mutation = migration.indexOf("v_meal_log_id := public.consume_meal_builder_items_and_log_meal");
    expect(migration).toContain("pg_catalog.jsonb_agg");
    expect(migration).toContain("order by (line ->> 'item_id')::uuid");
    expect(conflict).toBeGreaterThan(0);
    expect(conflict).toBeLessThan(mutation);
  });

  it("serializes concurrent request replays before reading inventory or mutating data", () => {
    const lock = migration.indexOf("pg_catalog.pg_advisory_xact_lock");
    const lookup = migration.indexOf("select * into v_existing");
    const mutation = migration.indexOf("v_meal_log_id := public.consume_meal_builder_items_and_log_meal");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(lookup);
    expect(lookup).toBeLessThan(mutation);
  });

  it("keeps the existing RPC available to unrelated meal-log producers", () => {
    expect(migration).not.toContain("drop function public.consume_meal_builder_items_and_log_meal(text");
    expect(migration).toContain("p_meal_name, p_meal_type, p_lines");
  });
});
