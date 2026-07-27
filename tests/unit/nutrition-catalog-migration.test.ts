import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260727000000_create_nutrition_catalog_items.sql", "utf8");
describe("nutrition catalog migration", () => {
  it("defines the scoped identity, validated nutrition, lookup indexes and RLS", () => {
    expect(sql).toContain("create table public.nutrition_catalog_items");
    expect(sql).toMatch(/user_id uuid not null/);
    expect(sql).toContain("unique (user_id, normalized_name, food_state, nutrition_basis)");
    expect(sql).toContain("'raw', 'cooked', 'drained', 'frozen', 'processed', 'not_applicable', 'unknown'");
    expect(sql).toContain("'per_100g', 'per_100ml', 'per_unit'");
    for (const macro of ["calories", "protein_g", "carbs_g", "fat_g"]) expect(sql).toContain(`${macro} >= 0`);
    expect(sql).toContain("using gin (aliases)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("refresh_after timestamptz");
  });
  it("isolates every operation and checks both sides of updates", () => {
    expect(sql.match(/\(select auth\.uid\(\)\) = user_id/g)).toHaveLength(5);
    expect(sql).toMatch(/for select[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/for insert[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/for update[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/for delete[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toContain("on conflict (user_id, normalized_name, food_state, nutrition_basis) do update");
    expect(sql).toContain("not public.nutrition_catalog_items.user_confirmed");
    expect(sql).toContain("public.nutrition_catalog_items.refresh_after <= pg_catalog.now()");
    expect(sql).toContain("excluded.source = 'user'");
    expect(sql).toContain("public.nutrition_catalog_items.source <> 'user'");
    expect(sql).toContain("revoke all on function public.upsert_nutrition_catalog_items(jsonb) from public, anon");
    expect(sql).toContain("grant execute on function public.upsert_nutrition_catalog_items(jsonb) to authenticated");
  });
});
