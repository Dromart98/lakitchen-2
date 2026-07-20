import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260724000000_save_ai_meal_inventory_atomically.sql"), "utf8");

describe("AI meal inventory atomic RPC migration", () => {
  it("uses one authenticated transaction with idempotency and scoped permissions", () => {
    for (const fragment of ["ai_meal_inventory_submissions", "primary key (user_id, submission_id)", "auth.uid()", "pg_advisory_xact_lock", "submission-conflict", "security definer", "set search_path = ''", "revoke all on function", "grant execute", "authenticated"]) expect(sql).toContain(fragment);
    expect(sql).not.toContain("service_role");
  });

  it("validates every line before inserting the meal, snapshots consumed products, and preserves decimals", () => {
    for (const fragment of ["jsonb_object_keys", "duplicate-product", "product-not-found", "product-not-owned", "quantity-insufficient", "incompatible-unit", "for update", "insert into public.daily_meal_logs", "insert into public.daily_meal_log_items", "round(v_total_calories, 1)", "update public.inventory_items", "inventory-mutation-failed"]) expect(sql).toContain(fragment);
    expect(sql).not.toContain("round(v_total_calories)::integer");
  });
});
