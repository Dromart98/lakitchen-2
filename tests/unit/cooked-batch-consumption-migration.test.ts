import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260729180000_consume_cooked_batch_atomically.sql", "utf8");
const action = readFileSync("app/recipes/actions.ts", "utf8");
const portion = readFileSync("modules/recipes/cooked-batch-portion.ts", "utf8");

describe("atomic cooked batch consumption migration", () => {
  it("creates an owner-readable, directly immutable event ledger", () => {
    expect(sql).toContain("create table public.user_saved_ai_recipe_cooked_batch_consumptions");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("for select to authenticated");
    expect(sql).toContain("revoke all on table public.user_saved_ai_recipe_cooked_batch_consumptions from authenticated");
    expect(sql).toContain("grant select on table public.user_saved_ai_recipe_cooked_batch_consumptions to authenticated");
    expect(sql).not.toMatch(/consumptions[\s\S]*for (insert|update|delete) to authenticated/);
  });

  it("links the event to same-owner batch and meal with deletion restricted", () => {
    expect(sql).toContain("unique (id, user_id)");
    expect(sql).toMatch(/foreign key \(batch_id, user_id\)[\s\S]*on delete restrict/);
    expect(sql).toMatch(/foreign key \(meal_log_id, user_id\)[\s\S]*on delete restrict/);
  });

  it("hardens the authenticated-only definer RPC and its trigger", () => {
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("Untrusted consume_cooked_batch_and_log_meal owner");
    expect(sql).toContain("from public");
    expect(sql).toContain("from anon");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("revoke execute on function public.set_cooked_batch_monotonic_version() from authenticated");
  });

  it("checks idempotency before mutable state and rejects incompatible reuse", () => {
    const existing = sql.indexOf("where request_id = p_request_id");
    const batch = sql.indexOf("where id = p_batch_id and user_id = v_user_id");
    expect(existing).toBeGreaterThan(0);
    expect(existing).toBeLessThan(batch);
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("v_existing.idempotency_fingerprint <> v_fingerprint");
    expect(sql).toContain("message = 'idempotency_conflict'");
    expect(sql).toContain("return query select v_existing.consumed_cooked_weight_g");
  });

  it("locks the owned batch, enforces its version and exactly one unit", () => {
    expect(sql).toMatch(/from public\.user_saved_ai_recipe_cooked_batches[\s\S]*where id = p_batch_id and user_id = v_user_id[\s\S]*for update/);
    expect(sql).toContain("(p_servings_consumed is null) = (p_cooked_weight_consumed_g is null)");
    expect(sql).toContain("v_batch.updated_at <> p_expected_batch_updated_at");
    expect(sql).toContain("message = 'insufficient_batch'");
    expect(sql).toContain("message = 'batch_exhausted'");
  });

  it("uses the same fraction equations and IEEE-754 tolerance as TypeScript", () => {
    expect(sql).toContain("2.220446049250313e-16::double precision");
    expect(sql).toContain("* greatest(1::double precision");
    expect(sql).toContain("* 8");
    expect(portion).toContain("Number.EPSILON * scale * FLOATING_POINT_TOLERANCE_MULTIPLIER");
    expect(sql).toContain("v_weight := v_batch.cooked_weight_g * (v_requested / v_batch.servings)");
    expect(sql).toContain("v_fraction := v_weight / v_batch.cooked_weight_g");
    expect(sql).toContain("calories := v_batch.total_calories * v_fraction");
    expect(sql).toContain("if abs(v_weight - v_remaining) <= v_tolerance");
  });

  it("creates one meal and event then advances only the batch in one transaction", () => {
    expect(sql.match(/insert into public\.daily_meal_logs/g)).toHaveLength(1);
    expect(sql.match(/insert into public\.user_saved_ai_recipe_cooked_batch_consumptions/g)).toHaveLength(1);
    expect(sql.match(/update public\.user_saved_ai_recipe_cooked_batches as batch/g)).toHaveLength(1);
    expect(sql).not.toContain("daily_meal_log_items");
    expect(sql).not.toContain("inventory_items");
    expect(sql).not.toContain("target_calories");
  });

  it("persists unrounded macros, UTC consumption date, and monotonic millisecond versions", () => {
    expect(sql).toContain("alter column calories type double precision");
    expect(sql).toContain("(pg_catalog.now() at time zone 'utc')::date");
    expect(sql).toContain("alter column updated_at type timestamptz(3)");
    expect(sql).toContain("old.updated_at + interval '1 millisecond'");
  });

  it("adds a separate safe server action without changing the old cook-and-log action", () => {
    expect(action).toContain("export async function consumeCookedBatchAndLogMealAction");
    expect(action).toContain('"consume_cooked_batch_and_log_meal"');
    expect(action.match(/export async function cookSavedAiRecipeAndLogMealAction/g)).toHaveLength(1);
  });
});
