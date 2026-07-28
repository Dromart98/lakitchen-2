import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260801000000_restore_scheduled_daily_plan_saving.sql",
  "utf8",
).toLowerCase();

describe("restored scheduled daily plan RPC migration", () => {
  it("adds date uniqueness without replacing fingerprint uniqueness", () => {
    expect(sql).toContain("unique (user_id, plan_date)");
    expect(sql).not.toContain("drop constraint");
  });

  it("keeps the exact RPC signature used by the server action", () => {
    expect(sql).toMatch(
      /save_scheduled_daily_plan\s*\(\s*p_plan_date date,\s*p_priority_mode text,\s*p_max_minutes_per_meal integer,\s*p_target jsonb,\s*p_total jsonb,\s*p_difference jsonb,\s*p_fit text,\s*p_meals jsonb,\s*p_fingerprint text\s*\)/,
    );
    expect(sql).toContain("returns uuid");
    expect(sql).not.toContain("p_user_id");
  });

  it("derives ownership and validates UTC dates and the complete payload", () => {
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("now() at time zone 'utc'");
    expect(sql).toContain("p_plan_date < v_utc_date");
    expect(sql).toContain("p_plan_date > v_utc_date + 6");
    expect(sql).toContain("invalid_plan_date");
    expect(sql).toContain("jsonb_typeof(p_target) <> 'object'");
    expect(sql).toContain("jsonb_typeof(p_total) <> 'object'");
    expect(sql).toContain("jsonb_typeof(p_difference) <> 'object'");
    expect(sql).toContain("jsonb_typeof(p_meals) <> 'array'");
    expect(sql).toContain("jsonb_array_length(p_meals) <> 4");
    expect(sql).toContain("p_fingerprint !~ '^[0-9a-f]{64}$'");
  });

  it("uses one insert and maps concurrent date conflicts", () => {
    expect(sql.match(/insert into public\.user_saved_daily_plans/g)).toHaveLength(1);
    expect(sql).toContain("returning id into v_id");
    expect(sql).toContain("when unique_violation then");
    expect(sql).toContain("message = 'date_occupied'");
    expect(sql).not.toContain("pg_advisory");
  });

  it("restricts execution and leaves direct inserts unavailable", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(/revoke all on function[\s\S]*from public;/);
    expect(sql).toMatch(/revoke all on function[\s\S]*from anon;/);
    expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated;/);
    expect(sql).toContain(
      "revoke insert on table public.user_saved_daily_plans from authenticated",
    );
    expect(sql).not.toContain("service_role");
    expect(sql).not.toContain("consume_saved_daily_plan_meal");
  });
});
