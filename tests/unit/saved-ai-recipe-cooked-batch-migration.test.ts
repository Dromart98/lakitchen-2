import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260729155804_create_saved_ai_recipe_cooked_batches.sql", "utf8");
const indexFixSql = readFileSync("supabase/migrations/20260729160115_fix_cooked_batch_source_owner_index.sql", "utf8");

describe("saved AI recipe cooked batch migration", () => {
  it("stores independent batch snapshots without derived portion fields", () => {
    expect(sql).toContain("id uuid primary key default gen_random_uuid()");
    expect(sql).toContain("source_recipe_id uuid");
    expect(sql).not.toContain("source_recipe_id uuid primary key");
    for (const column of ["recipe_title", "raw_weight_g", "cooked_weight_g", "servings", "total_calories", "total_protein_g", "total_carbs_g", "total_fat_g", "consumed_cooked_weight_g", "created_at", "updated_at"]) {
      expect(sql).toContain(column);
    }
    for (const derived of ["per_serving", "remaining_nutrition", "remaining_weight", "yield_percentage", "yield_percent"]) {
      expect(sql).not.toContain(derived);
    }
  });

  it("keeps the owner while detaching a deleted source recipe", () => {
    expect(sql).toContain("foreign key (source_recipe_id, user_id)");
    expect(sql).toContain("references public.user_saved_ai_recipes(id, user_id)");
    expect(sql).toContain("on delete set null (source_recipe_id)");
    expect(sql).not.toMatch(/references public\.user_saved_ai_recipes\(id, user_id\)\s+on delete cascade/);
  });

  it("covers the composite source-owner foreign key", () => {
    expect(indexFixSql).toContain("drop index if exists public.user_saved_ai_recipe_cooked_batches_source_recipe_idx");
    expect(indexFixSql).toContain("on public.user_saved_ai_recipe_cooked_batches(source_recipe_id, user_id)");
  });

  it("constrains finite positive weights, whole servings, nutrition, consumption and timestamps", () => {
    expect(sql).toMatch(/raw_weight_g > 0[\s\S]*raw_weight_g <> 'Infinity'[\s\S]*raw_weight_g <> 'NaN'/);
    expect(sql).toMatch(/cooked_weight_g > 0[\s\S]*cooked_weight_g <> 'Infinity'[\s\S]*cooked_weight_g <> 'NaN'/);
    expect(sql).toContain("check (servings > 0)");
    for (const nutrient of ["total_calories", "total_protein_g", "total_carbs_g", "total_fat_g"]) {
      expect(sql).toMatch(new RegExp(`${nutrient} >= 0[\\s\\S]*${nutrient} <> 'Infinity'[\\s\\S]*${nutrient} <> 'NaN'`));
    }
    expect(sql).toContain("consumed_cooked_weight_g double precision not null default 0");
    expect(sql).toContain("consumed_cooked_weight_g >= 0");
    expect(sql).toContain("consumed_cooked_weight_g <= cooked_weight_g");
    expect(sql).toContain("check (updated_at >= created_at)");
  });

  it("forces owner-only reads and reserves every direct write", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("for select");
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).toContain("revoke all on table public.user_saved_ai_recipe_cooked_batches from anon");
    expect(sql).toContain("revoke all on table public.user_saved_ai_recipe_cooked_batches from authenticated");
    expect(sql).toContain("grant select on table public.user_saved_ai_recipe_cooked_batches to authenticated");
    expect(sql).not.toMatch(/create policy[\s\S]*for (insert|update|delete)/);
  });

  it("keeps the original snapshot immutable while allowing consumption progress", () => {
    expect(sql).toContain("create or replace function public.prevent_cooked_batch_snapshot_change()");
    for (const field of ["id", "user_id", "recipe_title", "raw_weight_g", "cooked_weight_g", "servings", "total_calories", "total_protein_g", "total_carbs_g", "total_fat_g", "created_at"]) {
      expect(sql).toContain(`new.${field} is distinct from old.${field}`);
    }
    expect(sql).toContain("old.source_recipe_id is not null and new.source_recipe_id is null");
    expect(sql).toContain("before update on public.user_saved_ai_recipe_cooked_batches");
    expect(sql).not.toContain("new.consumed_cooked_weight_g is distinct from old.consumed_cooked_weight_g");
    expect(sql).not.toContain("new.updated_at is distinct from old.updated_at");
  });
});
