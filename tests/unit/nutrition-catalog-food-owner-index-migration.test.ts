import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const originalSql = readFileSync(
  "supabase/migrations/20260728000000_create_food_catalog_items.sql",
  "utf8",
);
const indexFixSql = readFileSync(
  "supabase/migrations/20260728100000_fix_nutrition_catalog_food_owner_fk_index.sql",
  "utf8",
);

describe("nutrition catalog food owner FK index migration", () => {
  it("replaces the single-column index with the exact composite FK index", () => {
    expect(indexFixSql).toContain(
      "drop index if exists public.nutrition_catalog_items_food_catalog_item_idx",
    );
    expect(indexFixSql).toMatch(
      /create index nutrition_catalog_items_food_owner_idx\s+on public\.nutrition_catalog_items \(food_catalog_item_id, user_id\)/,
    );
    expect(indexFixSql).not.toMatch(
      /create index\s+nutrition_catalog_items_food_catalog_item_idx/i,
    );
  });

  it("leaves the existing owner FK unchanged", () => {
    expect(originalSql).toMatch(
      /constraint nutrition_catalog_items_food_owner_fk\s+foreign key \(food_catalog_item_id, user_id\)\s+references public\.food_catalog_items \(id, user_id\)\s+on delete set null \(food_catalog_item_id\)/,
    );
    expect(indexFixSql).not.toMatch(/foreign key|alter table|drop constraint/i);
  });

  it("does not change RLS, permissions, or function security", () => {
    expect(indexFixSql).not.toMatch(
      /row level security|create policy|drop policy|\bgrant\b|\brevoke\b|security definer/i,
    );
  });
});
