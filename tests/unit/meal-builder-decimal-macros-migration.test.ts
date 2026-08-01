import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const previousSql = readFileSync(
  "supabase/migrations/20260805000000_use_confirmed_unit_measures_for_shared_meal_consumption.sql",
  "utf8",
).toLowerCase();
const fixSql = readFileSync(
  "supabase/migrations/20260806000000_preserve_decimal_meal_builder_macros.sql",
  "utf8",
).toLowerCase();

const totals = ["calories", "protein_g", "carbs_g", "fat_g"] as const;

describe("meal-builder decimal macro persistence migration", () => {
  it("targets the confirmed integer-rounding regression in the current RPC", () => {
    for (const total of totals) {
      expect(previousSql).toContain(`round(v_total_${total})::integer`);
      expect(fixSql).toContain(
        `'round(v_total_${total})::integer', 'round(v_total_${total}, 1)'`,
      );
    }
  });

  it("preserves one decimal instead of weakening the E2E expectation", () => {
    expect(Math.round(37.5 * 10) / 10).toBe(37.5);
    expect(fixSql).toContain("round(v_total_carbs_g, 1)");
    expect(fixSql).not.toContain("'round(v_total_carbs_g)::integer', 'round(v_total_carbs_g)::integer'");
  });

  it("keeps the existing security boundary and authenticated-only execution", () => {
    expect(fixSql).toContain("pg_get_functiondef");
    expect(fixSql).toContain("security_definer");
    expect(fixSql).toContain("search_path=\"\"");
    expect(fixSql).toContain("untrusted meal-builder rpc owner");
    expect(fixSql).toContain(
      "revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public",
    );
    expect(fixSql).toContain(
      "revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon",
    );
    expect(fixSql).toContain(
      "grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated",
    );
  });
});
