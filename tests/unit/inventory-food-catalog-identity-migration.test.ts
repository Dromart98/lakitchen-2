import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260729000000_add_inventory_food_catalog_identity.sql"), "utf8").toLowerCase();

describe("inventory food catalog identity migration", () => {
  it("adds a nullable, owner-protected identity without changing inventory RLS", () => {
    expect(sql).toMatch(/add column food_catalog_item_id uuid null/);
    expect(sql).toMatch(/foreign key \(food_catalog_item_id, user_id\)\s+references public\.food_catalog_items \(id, user_id\)\s+on delete set null \(food_catalog_item_id\)/);
    expect(sql).toMatch(/create index inventory_items_food_owner_idx\s+on public\.inventory_items \(food_catalog_item_id, user_id\)/);
    expect(sql).not.toContain("alter table public.inventory_items disable row level security");
    expect(sql).not.toMatch(/food_catalog_item_id uuid not null/);
    expect(sql).not.toContain("update public.inventory_items set food_catalog_item_id");
  });

  it("keeps voice payloads backward compatible, owner scoped, atomic and idempotent", () => {
    expect(sql).toContain("not between 10 and 11");
    expect(sql).toContain("value - 'food_catalog_item_id'");
    expect(sql).toContain("v_saved.payload_hash <> v_hash");
    expect(sql).toContain("message = 'submission-conflict'");
    expect(sql).toContain("where id = v_food_catalog_item_id and user_id = v_user_id");
    expect(sql).toContain("message = 'invalid-food-catalog-item'");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("between 1 and 30");
    expect(sql).toContain("security definer");
    expect(sql).toContain("auth.uid()");
  });
});
