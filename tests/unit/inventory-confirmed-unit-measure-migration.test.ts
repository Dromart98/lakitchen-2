import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260804000000_use_confirmed_unit_measures_for_inventory_meals.sql",
  "utf8",
).toLowerCase();

describe("confirmed unit measure inventory meal migration", () => {
  it("keeps the RPC contract and permissions", () => {
    expect(sql).toContain("consume_inventory_item_and_log_meal(\n  p_item_id uuid,\n  p_consumed_quantity numeric,\n  p_meal_type text\n)");
    expect(sql).toContain("returns numeric");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from public");
    expect(sql).toContain("grant execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) to authenticated");
  });

  it("locks the owned inventory first and compatible measures deterministically", () => {
    expect(sql.indexOf("from public.inventory_items")).toBeLessThan(sql.indexOf("from public.food_quantity_equivalences"));
    expect(sql).toContain("and user_id = v_user_id");
    expect(sql).toContain("and food_catalog_item_id = v_item.food_catalog_item_id");
    expect(sql).toContain("order by variant_key, id\n      for update");
    expect(sql).toContain("if v_equivalence_count <> 1 then");
  });

  it("only accepts confirmed user unit measures and preserves exact conversions", () => {
    expect(sql).toContain("and measure_kind = 'unit'");
    expect(sql).toContain("and user_confirmed = true");
    expect(sql).toContain("and source = 'user'");
    expect(sql).toContain("v_item.nutrition_basis = 'per_100g' and v_item.unit = 'kg'");
    expect(sql).toContain("v_item.nutrition_basis = 'per_100ml' and v_item.unit = 'l'");
    expect(sql).toContain("v_item.nutrition_basis = 'per_unit' and v_item.unit = 'ud'");
  });

  it("calculates server-side snapshots before changing original stock", () => {
    expect(sql).toContain("p_consumed_quantity * v_equivalence.canonical_quantity / 100");
    expect(sql).toContain("p_consumed_quantity * 1000 / v_equivalence.canonical_quantity");
    expect(sql.indexOf("insert into public.daily_meal_log_items")).toBeLessThan(sql.indexOf("delete from public.inventory_items"));
    expect(sql).toContain("v_remaining_quantity := v_item.quantity - p_consumed_quantity");
    expect(sql).toContain("'incompatible inventory nutrition unit'");
  });
});
