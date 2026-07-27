import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260728000000_create_food_catalog_items.sql", "utf8");

describe("food catalog identity migration", () => {
  it("defines identity without nutrition values or nutrition basis", () => {
    const table = sql.slice(sql.indexOf("create table public.food_catalog_items"), sql.indexOf("create unique index"));
    expect(table).toContain("unique (user_id, normalized_name, food_state)");
    expect(table).toContain("unique (id, user_id)");
    expect(table).not.toMatch(/calories|protein_g|carbs_g|fat_g|nutrition_basis/);
    expect(sql).toContain("food_catalog_items_external_identity_unique");
    expect(sql).toContain("where external_id is not null");
  });

  it("enforces owner-safe nullable linking and non-destructive deletion", () => {
    expect(sql).toContain("foreign key (food_catalog_item_id, user_id)");
    expect(sql).toContain("references public.food_catalog_items (id, user_id)");
    expect(sql).toContain("on delete set null (food_catalog_item_id)");
    expect(sql).toContain("nutrition_catalog_items_food_catalog_item_idx");
  });

  it("enables complete optimized RLS and a restricted invoker RPC", () => {
    expect(sql.match(/\(select auth\.uid\(\)\) = user_id/g)).toHaveLength(5);
    expect(sql).toMatch(/for update[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toContain("security invoker");
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toContain("auth.uid() <> p_user_id");
    expect(sql).toContain("revoke all on function public.resolve_or_create_food_catalog_item");
    expect(sql).toContain("to authenticated");
  });

  it("backs up exact/external identities and protects concurrent resolution and user authority", () => {
    expect(sql).toContain("distinct on (user_id, source, external_id, food_state)");
    expect(sql).toContain("distinct on (n.user_id, n.normalized_name, n.food_state)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("normalized_name = any(v_aliases) or aliases && v_aliases");
    expect(sql).toContain("when p_user_confirmed and not user_confirmed then p_display_name else display_name");
  });
});
