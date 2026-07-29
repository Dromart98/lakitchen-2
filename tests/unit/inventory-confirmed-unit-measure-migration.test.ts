import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260804000000_use_confirmed_unit_measures_for_inventory_meals.sql",
  "utf8",
).toLowerCase();

type Measure = { canonicalQuantity: number; canonicalUnit: "g" | "ml" | "ud" };

function executeRpcMeasureSemantics(
  nutritionBasis: "per_100g" | "per_100ml" | "per_unit",
  inventoryUnit: "g" | "kg" | "ml" | "l" | "ud",
  consumedQuantity: number,
  candidates: Measure[],
) {
  if (nutritionBasis === "per_100g" && inventoryUnit === "g") return consumedQuantity / 100;
  if (nutritionBasis === "per_100g" && inventoryUnit === "kg") return consumedQuantity * 10;
  if (nutritionBasis === "per_100ml" && inventoryUnit === "ml") return consumedQuantity / 100;
  if (nutritionBasis === "per_100ml" && inventoryUnit === "l") return consumedQuantity * 10;
  if (nutritionBasis === "per_unit" && inventoryUnit === "ud") return consumedQuantity;
  if (candidates.length !== 1) throw new Error("Incompatible inventory nutrition unit");

  const [{ canonicalQuantity, canonicalUnit }] = candidates;
  if (!Number.isFinite(canonicalQuantity) || canonicalQuantity <= 0 || canonicalUnit === "ud") {
    throw new Error("Incompatible inventory nutrition unit");
  }
  if (nutritionBasis === "per_100g" && inventoryUnit === "ud" && canonicalUnit === "g") {
    return consumedQuantity * canonicalQuantity / 100;
  }
  if (nutritionBasis === "per_100ml" && inventoryUnit === "ud" && canonicalUnit === "ml") {
    return consumedQuantity * canonicalQuantity / 100;
  }
  if (nutritionBasis === "per_unit" && ["g", "kg"].includes(inventoryUnit) && canonicalUnit === "g") {
    return consumedQuantity * (inventoryUnit === "kg" ? 1000 : 1) / canonicalQuantity;
  }
  if (nutritionBasis === "per_unit" && ["ml", "l"].includes(inventoryUnit) && canonicalUnit === "ml") {
    return consumedQuantity * (inventoryUnit === "l" ? 1000 : 1) / canonicalQuantity;
  }
  throw new Error("Incompatible inventory nutrition unit");
}

describe("confirmed unit measure inventory meal migration", () => {
  it("keeps the RPC contract and permissions", () => {
    expect(sql).toContain("consume_inventory_item_and_log_meal(\n  p_item_id uuid,\n  p_consumed_quantity numeric,\n  p_meal_type text\n)");
    expect(sql).toContain("returns numeric");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from public");
    expect(sql).toContain("revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from anon");
    expect(sql).toContain("grant execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) to authenticated");
    expect(sql).not.toMatch(/grant\s+update\s+on\s+(?:table\s+)?public\.food_quantity_equivalences/);
  });

  it("keeps the definer boundary owner-scoped and schema-qualified", () => {
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("if v_user_id is null then");
    for (const relation of [
      "public.inventory_items",
      "public.food_quantity_equivalences",
      "public.daily_meal_logs",
      "public.daily_meal_log_items",
    ]) expect(sql).toContain(relation);

    const inventoryQuery = sql.slice(sql.indexOf("from public.inventory_items"), sql.indexOf("for update", sql.indexOf("from public.inventory_items")));
    const equivalenceQuery = sql.slice(sql.indexOf("from public.food_quantity_equivalences"), sql.indexOf("for update", sql.indexOf("from public.food_quantity_equivalences")));
    expect(inventoryQuery).toContain("user_id = v_user_id");
    expect(equivalenceQuery).toContain("user_id = v_user_id");
    expect(sql).not.toMatch(/\bexecute\s+(?:format|\$|')/);
    expect(sql).not.toContain("service_role");
  });

  it("rejects an untrusted effective function owner", () => {
    expect(sql).toContain("pg_catalog.pg_get_userbyid");
    expect(sql).toContain("v_owner in ('authenticated', 'anon')");
  });

  it("locks the owned inventory first and all confirmed unit measures deterministically", () => {
    expect(sql.indexOf("from public.inventory_items")).toBeLessThan(sql.indexOf("from public.food_quantity_equivalences"));
    expect(sql).toContain("and user_id = v_user_id");
    expect(sql).toContain("and food_catalog_item_id = v_item.food_catalog_item_id");
    expect(sql).toContain("order by variant_key, id\n      for update");
    expect(sql).toContain("if v_equivalence_count <> 1 then");
    const lockedQuery = sql.slice(
      sql.indexOf("select *\n      from public.food_quantity_equivalences"),
      sql.indexOf("    loop", sql.indexOf("from public.food_quantity_equivalences")),
    );
    expect(lockedQuery).not.toContain("canonical_unit");
    expect(lockedQuery).not.toContain("canonical_quantity");
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

  it("fails closed on ambiguity before validating canonical unit", () => {
    expect(() => executeRpcMeasureSemantics("per_100g", "ud", 2, [
      { canonicalQuantity: 58, canonicalUnit: "g" },
      { canonicalQuantity: 60, canonicalUnit: "ml" },
    ])).toThrow("Incompatible inventory nutrition unit");
    expect(() => executeRpcMeasureSemantics("per_100g", "ud", 2, [
      { canonicalQuantity: 58, canonicalUnit: "g" },
      { canonicalQuantity: 1, canonicalUnit: "ud" },
    ])).toThrow("Incompatible inventory nutrition unit");
  });

  it("validates the sole candidate dimension and calculates compatible measures", () => {
    expect(() => executeRpcMeasureSemantics("per_100g", "ud", 2, [
      { canonicalQuantity: 60, canonicalUnit: "ml" },
    ])).toThrow("Incompatible inventory nutrition unit");
    expect(executeRpcMeasureSemantics("per_100g", "ud", 2, [
      { canonicalQuantity: 58, canonicalUnit: "g" },
    ])).toBe(1.16);
    expect(executeRpcMeasureSemantics("per_100ml", "ud", 0.5, [
      { canonicalQuantity: 250, canonicalUnit: "ml" },
    ])).toBe(1.25);
  });

  it("keeps exact conversions independent from equivalence ambiguity", () => {
    const ambiguous = [
      { canonicalQuantity: 58, canonicalUnit: "g" as const },
      { canonicalQuantity: 60, canonicalUnit: "ml" as const },
    ];
    expect(executeRpcMeasureSemantics("per_100g", "kg", 0.2, ambiguous)).toBe(2);
    expect(executeRpcMeasureSemantics("per_100ml", "l", 0.25, ambiguous)).toBe(2.5);
    expect(executeRpcMeasureSemantics("per_unit", "ud", 2, ambiguous)).toBe(2);
  });
});
