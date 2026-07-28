import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260730000000_propagate_food_identity_to_meals_and_saved_recipes.sql"),
  "utf8",
);

describe("phase 1.3B2 food identity migration", () => {
  it("adds nullable owner-scoped identity columns, immediate indexes, and SET NULL foreign keys", () => {
    expect(sql.match(/add column food_catalog_item_id uuid null/g)).toHaveLength(2);
    expect(sql.match(/foreign key \(food_catalog_item_id, user_id\)/g)).toHaveLength(2);
    expect(sql.match(/references public\.food_catalog_items \(id, user_id\)/g)).toHaveLength(2);
    expect(sql.match(/on delete set null \(food_catalog_item_id\)/g)).toHaveLength(2);
    expect(sql.match(/on public\.(?:daily_meal_log_items|user_saved_ai_recipe_ingredients) \(food_catalog_item_id, user_id\)/g)).toHaveLength(2);
  });

  it("backfills only through surviving inventory rows owned by the same user", () => {
    expect(sql).toContain("inventory.id = meal_item.source_inventory_item_id");
    expect(sql).toContain("inventory.user_id = meal_item.user_id");
    expect(sql).toContain("inventory.id = ingredient.inventory_item_id");
    expect(sql).toContain("inventory.user_id = ingredient.user_id");
    expect(sql).not.toMatch(/similarity|levenshtein|lower\s*\(.*name/i);
  });

  it("makes individual consumption create a complete identity snapshot before stock deletion", () => {
    expect(sql).toContain("create or replace function public.consume_inventory_item_and_log_meal");
    expect(sql).toContain("v_meal_log_id, v_user_id, v_item.id, v_item.food_catalog_item_id");
    expect(sql).toContain("btrim(v_item.name), p_consumed_quantity, v_item.unit, v_item.nutrition_basis");
    expect(sql.indexOf("insert into public.daily_meal_log_items")).toBeLessThan(sql.indexOf("delete from public.inventory_items"));
  });

  it("snapshots one server-derived identity per locked meal-builder ingredient", () => {
    expect(sql).toContain("food_catalog_item_id uuid,");
    expect(sql).toContain("v_item.food_catalog_item_id");
    expect(sql).toContain("from pg_temp.meal_builder_item_snapshots");
    expect(sql).toContain("and user_id = v_user_id\n    for update");
  });

  it("snapshots AI meal identity from each validated locked inventory row", () => {
    expect(sql).toContain("item_id uuid primary key, food_catalog_item_id uuid");
    expect(sql).toContain("values (v_item.id, v_item.food_catalog_item_id");
    expect(sql).toContain("if v_item.user_id <> v_user_id then raise exception using errcode = '42501'");
    expect(sql).not.toMatch(/v_line\s*->>\s*'food_catalog_item_id'/);
  });

  it("locks saved-recipe inventory deterministically and preserves ingredient order", () => {
    expect(sql).toContain("create or replace function public.save_user_ai_recipe");
    expect(sql).toContain("with ordinality as ingredient(value, ordinality)");
    expect(sql).toContain("order by inventory.id\n    for share of inventory");
    expect(sql).not.toMatch(/for key share/i);
    expect(sql).toContain("ingredient.sort_order");
    expect(sql).toContain("order by ingredient.sort_order");
    expect(sql).toContain("inventory.food_catalog_item_id");
    expect(sql).toContain("inventory.user_id = v_user_id");
    expect(sql).toContain("v_locked_inventory_count <> jsonb_array_length(p_ingredients)");
    expect(sql).not.toMatch(/ingredient(?:\.ingredient)?\s*->>\s*'food_catalog_item_id'/);
  });

  it("preserves meal and recipe rows when a catalog identity is deleted", () => {
    expect(sql.match(/on delete set null \(food_catalog_item_id\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/references public\.food_catalog_items[^;]+on delete cascade/is);
  });
});
