import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createSql = readFileSync("supabase/migrations/20260729145112_create_saved_ai_recipe_cooking_yields.sql", "utf8");
const optimizeRlsSql = readFileSync("supabase/migrations/20260729145406_optimize_saved_ai_recipe_cooking_yield_rls.sql", "utf8");

describe("saved recipe cooking yield migrations", () => {
  it("stores one owner-bound measurement per recipe with cascade deletion", () => {
    expect(createSql).toContain("recipe_id uuid primary key");
    expect(createSql).toMatch(/foreign key \(recipe_id, user_id\)[\s\S]*references public\.user_saved_ai_recipes\(id, user_id\)[\s\S]*on delete cascade/);
    expect(createSql).toContain("user_saved_ai_recipe_cooking_yields_user_id_idx");
  });

  it("enforces RLS for every mutation and checks parent ownership", () => {
    expect(createSql).toContain("enable row level security");
    expect(createSql).toContain("force row level security");
    for (const operation of ["select", "insert", "update", "delete"]) expect(createSql).toContain(`for ${operation}`);
    expect(createSql).toMatch(/exists \([\s\S]*recipes\.id = recipe_id and recipes\.user_id = auth\.uid\(\)/);
    expect(createSql).toContain("revoke all on table public.user_saved_ai_recipe_cooking_yields from anon");
  });

  it("rejects non-positive and non-finite observed weights", () => {
    expect(createSql).toContain("raw_weight_g > 0");
    expect(createSql).toContain("cooked_weight_g > 0");
    expect(createSql).toContain("raw_weight_g <> 'Infinity'::double precision");
    expect(createSql).toContain("cooked_weight_g <> 'Infinity'::double precision");
    expect(createSql).toContain("raw_weight_g <> 'NaN'::double precision");
    expect(createSql).toContain("cooked_weight_g <> 'NaN'::double precision");
  });

  it("optimizes auth checks without weakening ownership", () => {
    for (const policy of ["view", "create", "update", "delete"]) {
      expect(optimizeRlsSql).toContain(`Users can ${policy} own saved recipe cooking yields`);
    }
    expect(optimizeRlsSql).toContain("user_id = (select auth.uid())");
    expect(optimizeRlsSql).toMatch(/recipes\.id = recipe_id[\s\S]*recipes\.user_id = \(select auth\.uid\(\)\)/);
  });

  it("contains only observed weights, servings and lifecycle metadata", () => {
    expect(createSql).not.toMatch(/calories|protein|carbs|fat|yield_factor|per_100|inventory|water|oil/);
  });
});
