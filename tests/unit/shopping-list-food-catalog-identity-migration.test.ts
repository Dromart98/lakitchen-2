import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260731000000_add_shopping_list_food_catalog_identity.sql"), "utf8").toLowerCase();

describe("shopping-list food catalog identity migration", () => {
  it("adds an indexed nullable owner-scoped identity without a backfill", () => {
    expect(sql).toMatch(/add column food_catalog_item_id uuid null/);
    expect(sql).toMatch(/foreign key \(food_catalog_item_id, user_id\)\s+references public\.food_catalog_items \(id, user_id\)\s+on delete set null \(food_catalog_item_id\)/);
    expect(sql).toMatch(/create index shopping_list_items_food_owner_idx\s+on public\.shopping_list_items \(food_catalog_item_id, user_id\)/);
    expect(sql).not.toMatch(/update public\.shopping_list_items|similarity|normalized_name/);
  });

  it("clears identity atomically only when the persisted name changes", () => {
    expect(sql).toContain("if new.name is distinct from old.name");
    expect(sql).toContain("new.food_catalog_item_id := null");
    expect(sql).toContain("before update of name on public.shopping_list_items");
  });

  it("locks an owned purchased row and transfers its server-read identity atomically", () => {
    expect(sql).toMatch(/where id = p_item_id and user_id = v_user_id and is_purchased = true\s+for update/);
    expect(sql).toContain("select id, name, quantity, unit, food_catalog_item_id");
    expect(sql).toContain("v_item.food_catalog_item_id");
    expect(sql).toContain("v_deleted_count <> 1");
    expect(sql).not.toMatch(/p_food_catalog_item_id/);
  });
});
