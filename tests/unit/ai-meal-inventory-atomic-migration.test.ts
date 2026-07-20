import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const createSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260720143726_save_ai_meal_inventory_atomically.sql"),
  "utf8",
);
const runtimeFixSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260720143935_fix_ai_meal_inventory_coalesce.sql"),
  "utf8",
);
const permissionsSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260720144221_restrict_ai_meal_inventory_permissions.sql"),
  "utf8",
);
const effectiveSql = `${createSql}\n${runtimeFixSql}\n${permissionsSql}`;

describe("AI meal inventory atomic RPC migrations", () => {
  it("uses one authenticated transaction with persistent idempotency and scoped permissions", () => {
    for (const fragment of [
      "ai_meal_inventory_submissions",
      "primary key (user_id, submission_id)",
      "auth.uid()",
      "pg_advisory_xact_lock",
      "submission-conflict",
      "security definer",
      "set search_path = ''",
      "revoke all on function",
      "grant execute",
      "authenticated",
    ]) expect(effectiveSql).toContain(fragment);

    expect(createSql).toContain("meal_log_id uuid not null,");
    expect(createSql).not.toContain("meal_log_id uuid not null references");
    expect(permissionsSql).toContain("from service_role");
    expect(permissionsSql).not.toMatch(/grant execute[^;]+service_role/i);
  });

  it("validates before mutation, snapshots products, preserves decimals, and handles exact depletion", () => {
    for (const fragment of [
      "jsonb_object_keys",
      "duplicate-product",
      "product-not-found",
      "product-not-owned",
      "quantity-insufficient",
      "incompatible-unit",
      "for update",
      "insert into public.daily_meal_logs",
      "insert into public.daily_meal_log_items",
      "round(v_total_calories, 1)",
      "snapshot.available_quantity > snapshot.consumed_quantity",
      "snapshot.available_quantity = snapshot.consumed_quantity",
      "get diagnostics v_updated_count = row_count",
      "get diagnostics v_deleted_count = row_count",
      "inventory-mutation-failed",
    ]) expect(effectiveSql).toContain(fragment);

    expect(effectiveSql).not.toContain("round(v_total_calories)::integer");
  });

  it("contains the executable COALESCE correction discovered by the database test", () => {
    expect(runtimeFixSql).toContain("pg_catalog.btrim(coalesce(p_meal_name, ''))");
    expect(runtimeFixSql).not.toContain("pg_catalog.coalesce");
    expect(runtimeFixSql).toContain("create or replace function public.consume_ai_meal_inventory_and_log_meal");
  });
});
