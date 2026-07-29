import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260729145112_create_saved_ai_recipe_cooking_yields.sql", "utf8");

describe("saved recipe cooking yield migration", () => {
  it("stores one owner-bound measurement per recipe with cascade deletion", () => {
    expect(sql).toContain("recipe_id uuid primary key");
    expect(sql).toMatch(/foreign key \(recipe_id, user_id\)[\s\S]*references public\.user_saved_ai_recipes\(id, user_id\)[\s\S]*on delete cascade/);
    expect(sql).toContain("user_saved_ai_recipe_cooking_yields_user_id_idx");
  });

  it("enforces RLS for every mutation and checks parent ownership", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    for (const operation of ["select", "insert", "update", "delete"]) expect(sql).toContain(`for ${operation}`);
    expect(sql).toMatch(/exists \([\s\S]*recipes\.id = recipe_id and recipes\.user_id = auth\.uid\(\)/);
    expect(sql).toContain("revoke all on table public.user_saved_ai_recipe_cooking_yields from anon");
  });

  it("rejects non-positive and non-finite observed weights", () => {
    expect(sql).toContain("raw_weight_g > 0");
    expect(sql).toContain("cooked_weight_g > 0");
    expect(sql).toContain("raw_weight_g <> 'Infinity'::double precision");
    expect(sql).toContain("cooked_weight_g <> 'Infinity'::double precision");
    expect(sql).toContain("raw_weight_g <> 'NaN'::double precision");
    expect(sql).toContain("cooked_weight_g <> 'NaN'::double precision");
  });

  it("contains only observed weights, servings and lifecycle metadata", () => {
    expect(sql).not.toMatch(/calories|protein|carbs|fat|yield_factor|per_100|inventory|water|oil/);
  });
});
