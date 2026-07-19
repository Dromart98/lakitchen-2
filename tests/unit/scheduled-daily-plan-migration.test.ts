import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20260721000000_save_scheduled_daily_plans_atomically.sql", "utf8");
const actions = readFileSync("app/plan/actions.ts", "utf8");
describe("scheduled daily plan database contract", () => {
  it("guards the atomic save RPC", () => {
    for (const token of ["p_priority_mode is null", "p_max_minutes_per_meal is null", "p_target is null", "p_total is null", "p_difference is null", "p_fit is null", "p_meals is null", "p_fingerprint is null", "save_scheduled_daily_plan", "security definer", "auth.uid()", "pg_advisory_xact_lock", "user_id = v_user_id", "plan_date = p_plan_date", "date_occupied", "invalid_plan_date", "invalid_plan_payload", "return v_id", "revoke insert", "grant execute"]) expect(sql).toContain(token);
    expect(sql).not.toContain("p_user_id");
  });
  it("keeps server cooking checks before the consume RPC", () => {
    expect(actions).toContain('rpc("save_scheduled_daily_plan"');
    expect(actions).toContain("savedPlanError");
    expect(actions).toContain("canCookSavedPlanOnDate");
    expect(actions).toContain("not-yet-available");
  });
});
