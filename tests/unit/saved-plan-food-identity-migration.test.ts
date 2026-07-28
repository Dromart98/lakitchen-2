import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260802000000_add_saved_daily_plan_ingredient_identities.sql",
  "utf8",
).toLowerCase();

describe("saved daily plan ingredient identity migration", () => {
  it("creates the owner-scoped projection and its constraints", () => {
    expect(sql).toContain("unique (id, user_id)");
    expect(sql).toContain("create table public.user_saved_daily_plan_ingredient_identities");
    expect(sql).toContain("primary key (plan_id, meal_type, ingredient_index)");
    expect(sql).toContain("check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner'))");
    expect(sql).toContain("check (ingredient_index between 1 and 20)");
    expect(sql).toContain("foreign key (plan_id, user_id)");
    expect(sql).toContain("references public.user_saved_daily_plans (id, user_id)");
    expect(sql).toContain("on delete cascade");
    expect(sql).toContain("foreign key (food_catalog_item_id, user_id)");
    expect(sql).toContain("references public.food_catalog_items (id, user_id)");
    expect(sql).toContain("on delete set null (food_catalog_item_id)");
    expect(sql).toContain("(plan_id, user_id)");
    expect(sql).toContain("(food_catalog_item_id, user_id)");
    expect(sql).not.toMatch(/foreign key \(source_inventory_item_id/);
  });

  it("permits only owner-scoped browser reads", () => {
    expect(sql).toContain(
      "alter table public.user_saved_daily_plan_ingredient_identities enable row level security",
    );
    expect(sql).toContain("for select");
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).toContain(
      "grant select on table public.user_saved_daily_plan_ingredient_identities to authenticated",
    );
    expect(sql).not.toMatch(/grant (insert|update|delete)/);
    expect(sql).not.toContain("service_role");
  });

  it("backfills every ordered position only through owner-matched inventory", () => {
    expect(sql).toContain("invalid_saved_plan_identity_backfill");
    expect(sql).toContain("jsonb_array_elements(v_plan.meals) with ordinality");
    expect(sql).toContain(
      "jsonb_array_elements(v_meal -> 'ingredients') with ordinality",
    );
    expect(sql).toContain("v_inventory_item_id, inventory.food_catalog_item_id");
    expect(sql).toContain("left join public.inventory_items inventory");
    expect(sql).toContain("inventory.user_id = v_plan.user_id");
    expect(sql).not.toMatch(/normalized_name|similarity|open food facts|usda|\bai\b/);
  });

  it("keeps the save RPC signature and exact JSON contract", () => {
    expect(sql).toMatch(
      /save_scheduled_daily_plan\s*\(\s*p_plan_date date,\s*p_priority_mode text,\s*p_max_minutes_per_meal integer,\s*p_target jsonb,\s*p_total jsonb,\s*p_difference jsonb,\s*p_fit text,\s*p_meals jsonb,\s*p_fingerprint text\s*\)/,
    );
    expect(sql).toContain("v_ingredient_keys constant text[] := array[");
    expect(sql).toContain("'inventory_item_id', 'name', 'quantity', 'unit'");
    expect(sql).toContain("(v_ingredient - v_ingredient_keys) <> '{}'::jsonb");
    expect(sql).toContain("p_meals,");
    expect(sql).not.toContain("p_food_catalog_item_id");
  });

  it("locks inventory deterministically and validates its owner and snapshot", () => {
    const lock = sql.indexOf("order by inventory.id\n    for update of inventory");
    const planInsert = sql.indexOf("insert into public.user_saved_daily_plans");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(planInsert);
    expect(sql).toContain("inventory.user_id = v_user_id");
    expect(sql).toContain("inventory_item_not_found");
    expect(sql).toContain("ingredient ->> 'name' <> v_inventory.name");
    expect(sql).toContain("ingredient ->> 'unit' <> v_inventory.unit");
    expect(sql).toContain("v_inventory.expires_at < p_plan_date");
  });

  it("aggregates repeated quantities before comparing available stock", () => {
    expect(sql).toContain(
      "sum((ingredient ->> 'quantity')::numeric) as requested_quantity",
    );
    expect(sql).toContain(
      "v_inventory.requested_quantity > v_inventory.quantity",
    );
    expect(sql).toContain("quantity_exceeds_available_stock");
  });

  it("writes nullable inventory identity at every ordered ingredient position", () => {
    const planInsert = sql.indexOf("insert into public.user_saved_daily_plans");
    const identityInsert = sql.indexOf(
      "insert into public.user_saved_daily_plan_ingredient_identities",
      sql.indexOf("create or replace function public.save_scheduled_daily_plan"),
    );
    expect(identityInsert).toBeGreaterThan(planInsert);
    expect(sql.slice(identityInsert)).toContain("with ordinality ingredients");
    expect(sql.slice(identityInsert)).toContain("inventory.food_catalog_item_id");
    expect(sql.slice(identityInsert)).toContain(
      "order by meal_ordinality, ingredient_ordinality",
    );
    expect(sql).not.toContain("consume_saved_daily_plan_meal");
  });
});
