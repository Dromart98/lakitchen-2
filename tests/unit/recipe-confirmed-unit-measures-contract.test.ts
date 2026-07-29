import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/recipes/page.tsx", "utf8");
const action = readFileSync("app/recipes/actions.ts", "utf8");
const sql = readFileSync("supabase/migrations/20260805000000_use_confirmed_unit_measures_for_shared_meal_consumption.sql", "utf8").toLowerCase();

const stored = { id: "00000000-0000-4000-8000-000000000003", updatedAt: "2026-07-29T12:00:00.000Z", quantity: 58, unit: "g" };
function checkExpectation(expected: typeof stored | null) {
  if (!expected) return "ok";
  return JSON.stringify(expected) === JSON.stringify(stored) ? "ok" : "equivalence_conflict";
}

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

  it("keeps optimistic metadata server-only and maps conflicts to safe copy", () => {
    expect(page).not.toMatch(/name=["']expected_equivalence_|expected_equivalence_id/);
    expect(action).toContain('error.message === "equivalence_conflict"');
    expect(page).toContain("La medida habitual cambió mientras preparábamos la receta. Revísala y vuelve a intentarlo.");
  });

  it("keeps the shared RPC signature, security boundary, locking, and privileges", () => {
    expect(sql).toContain("consume_meal_builder_items_and_log_meal(\n  p_meal_name text,\n  p_meal_type text,\n  p_lines jsonb\n)");
    expect(sql).toContain("returns uuid");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("create temporary table pg_temp.meal_builder_lines");
    expect(sql).toContain("order by equivalence.food_catalog_item_id, equivalence.variant_key, equivalence.id\n    for update");
    expect(sql).toContain("if v_equivalence_count <> 1");
    expect(sql).toContain("and user_id = v_user_id");
    expect(sql).toContain("and equivalence.measure_kind = 'unit'");
    expect(sql).toContain("and equivalence.user_confirmed = true");
    expect(sql).toContain("and equivalence.source = 'user'");
    expect(sql).toContain("revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from public");
    expect(sql).toContain("revoke execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) from anon");
    expect(sql).toContain("grant execute on function public.consume_meal_builder_items_and_log_meal(text, text, jsonb) to authenticated");
    expect(sql).not.toMatch(/grant\s+update\s+on\s+(?:table\s+)?public\.food_quantity_equivalences/);
  });

  it("sanitizes complete optimistic expectations and rejects stale measures atomically", () => {
    for (const field of [
      "expected_equivalence_id",
      "expected_equivalence_updated_at",
      "expected_canonical_quantity",
      "expected_canonical_unit",
    ]) expect(sql).toContain(field);
    expect(sql).toContain("line.expected_equivalence_id is not null and (");
    expect(sql).toContain("v_equivalence_updated_at <> v_line.expected_equivalence_updated_at");
    expect(sql).toContain("v_equivalence_quantity <> v_line.expected_canonical_quantity");
    expect(sql).toContain("v_equivalence_unit <> v_line.expected_canonical_unit");
    expect(sql).toContain("message = 'equivalence_conflict'");
    expect(sql.indexOf("message = 'equivalence_conflict'")).toBeLessThan(sql.indexOf("insert into public.daily_meal_logs"));
  });

  it("accepts identical or absent expectations and rejects every stale field", () => {
    expect(checkExpectation(stored)).toBe("ok");
    expect(checkExpectation(null)).toBe("ok");
    expect(checkExpectation({ ...stored, updatedAt: "2026-07-29T12:01:00.000Z" })).toBe("equivalence_conflict");
    expect(checkExpectation({ ...stored, quantity: 60 })).toBe("equivalence_conflict");
    expect(checkExpectation({ ...stored, unit: "ml" })).toBe("equivalence_conflict");
    expect(checkExpectation({ ...stored, id: "00000000-0000-4000-8000-000000000004" })).toBe("equivalence_conflict");
    expect(sql).toContain("(not line ? 'expected_equivalence_id'");
    expect(sql).toContain("or\n        (line ? 'expected_equivalence_id'");
  });

  it("locks all inventory and equivalences globally before calculating any snapshot", () => {
    const inventoryLocks = sql.indexOf("-- lock every owned inventory row globally");
    const equivalenceLocks = sql.indexOf("-- one globally ordered lock query");
    const calculations = sql.indexOf("-- only after all global locks are held");
    expect(inventoryLocks).toBeGreaterThan(-1);
    expect(equivalenceLocks).toBeGreaterThan(inventoryLocks);
    expect(calculations).toBeGreaterThan(equivalenceLocks);
    expect(sql.slice(equivalenceLocks, calculations).match(/for update/g)).toHaveLength(1);
    expect(sql).toContain("create temporary table pg_temp.meal_builder_locked_equivalences");
  });
});
