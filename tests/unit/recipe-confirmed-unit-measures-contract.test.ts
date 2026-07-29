import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/recipes/page.tsx", "utf8");
const action = readFileSync("app/recipes/actions.ts", "utf8");
const sql = readFileSync("supabase/migrations/20260805000000_use_confirmed_unit_measures_for_shared_meal_consumption.sql", "utf8").toLowerCase();

describe("catalog recipe confirmed unit measures contract", () => {
  it("loads one owner-scoped grouped query in both server paths", () => {
    for (const source of [page, action]) {
      expect(source).toContain('.from("food_quantity_equivalences")');
      expect(source).toContain('.eq("user_id", user.id)');
      expect(source).toContain('.eq("measure_kind", "unit")');
      expect(source).toContain('.eq("user_confirmed", true)');
      expect(source).toContain('.eq("source", "user")');
      expect(source).toContain('.in("food_catalog_item_id", identityIds)');
      expect(source).toContain("selectInventoryUnitMeasures");
    }
  });

  it("keeps the shared RPC signature, security boundary, locking, and privileges", () => {
    expect(sql).toContain("consume_meal_builder_items_and_log_meal(\n  p_meal_name text,\n  p_meal_type text,\n  p_lines jsonb\n)");
    expect(sql).toContain("returns uuid");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("create temporary table pg_temp.meal_builder_lines");
    expect(sql).toContain("order by variant_key, id\n        for update");
    expect(sql).toContain("if v_equivalence_count <> 1");
    expect(sql).toContain("and user_id = v_user_id");
    expect(sql).toContain("and measure_kind = 'unit'");
    expect(sql).toContain("and user_confirmed = true");
    expect(sql).toContain("and source = 'user'");
    expect(sql).toContain("revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public");
    expect(sql).toContain("revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon");
    expect(sql).toContain("grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated");
    expect(sql).not.toMatch(/grant\s+update\s+on\s+(?:table\s+)?public\.food_quantity_equivalences/);
  });
});
