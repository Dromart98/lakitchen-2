import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721000000_save_scheduled_daily_plans_atomically.sql",
  "utf8",
);
const actions = readFileSync("app/plan/actions.ts", "utf8");

describe("scheduled daily plan database contract", () => {
  it("guards the atomic save RPC and preserves historical rows", () => {
    const requiredTokens = [
      "save_scheduled_daily_plan",
      "security definer",
      "auth.uid()",
      "pg_advisory_xact_lock",
      "user_id = v_user_id",
      "plan_date = p_plan_date",
      "p_priority_mode is null",
      "p_max_minutes_per_meal is null",
      "p_target is null",
      "p_total is null",
      "p_difference is null",
      "p_fit is null",
      "p_meals is null",
      "p_fingerprint is null",
      "invalid_plan_date",
      "invalid_plan_payload",
      "date_occupied",
      "return v_id",
      "revoke insert",
      "grant execute",
      "not_yet_available",
      "v_plan_date > current_date",
    ];

    for (const token of requiredTokens) {
      expect(sql).toContain(token);
    }

    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("delete from public.user_saved_daily_plans");
    expect(sql).not.toContain("update public.user_saved_daily_plans set plan_date");
  });

  it("uses the save RPC and maps its known internal errors", () => {
    const saveStart = actions.indexOf("export async function saveDailyPlanAction");
    const deleteStart = actions.indexOf("export async function deleteSavedDailyPlanAction");
    const saveAction = actions.slice(saveStart, deleteStart);

    expect(saveStart).toBeGreaterThanOrEqual(0);
    expect(deleteStart).toBeGreaterThan(saveStart);
    expect(saveAction).toContain('rpc("save_scheduled_daily_plan"');
    expect(saveAction).not.toContain(".insert(");
    expect(saveAction).toContain("date_occupied");
    expect(saveAction).toContain("invalid_plan_date");
    expect(saveAction).toContain('code: "date-occupied"');
    expect(saveAction).toContain('code: "invalid-plan-date"');
  });

  it("checks ownership and date availability before consuming a saved meal", () => {
    const cookStart = actions.indexOf("export async function cookSavedDailyPlanMealAction");
    const queryIndex = actions.indexOf('.select("plan_date")', cookStart);
    const queryErrorIndex = actions.indexOf("savedPlanError", cookStart);
    const validDateIndex = actions.indexOf("isValidDateKey", cookStart);
    const availabilityIndex = actions.indexOf("canCookSavedPlanOnDate", cookStart);
    const consumeRpcIndex = actions.indexOf('rpc("consume_saved_daily_plan_meal"', cookStart);

    expect(cookStart).toBeGreaterThanOrEqual(0);
    expect(queryIndex).toBeGreaterThan(cookStart);
    expect(queryErrorIndex).toBeGreaterThan(queryIndex);
    expect(validDateIndex).toBeGreaterThan(queryIndex);
    expect(availabilityIndex).toBeGreaterThan(validDateIndex);
    expect(consumeRpcIndex).toBeGreaterThan(availabilityIndex);
    expect(actions.slice(cookStart, consumeRpcIndex)).toContain("not-yet-available");
  });
});
