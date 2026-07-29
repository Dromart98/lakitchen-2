import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260806000000_create_saved_ai_recipe_cooked_batch_atomically.sql", "utf8");
const retrySql = readFileSync("supabase/migrations/20260806001000_fix_cooked_batch_retry_idempotency.sql", "utf8");
const sourceSql = readFileSync("supabase/migrations/20260806002000_preserve_cooked_batch_source_snapshot.sql", "utf8");
const action = readFileSync("app/recipes/actions.ts", "utf8");
const contract = readFileSync("modules/recipes/saved-ai-recipe-batch-creation.ts", "utf8");

describe("atomic saved AI recipe cooked batch migration", () => {
  it("exposes one hardened authenticated-only RPC", () => {
    expect(sql).toContain("create or replace function public.create_saved_ai_recipe_cooked_batch(");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("revoke execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) from public");
    expect(sql).toContain("revoke execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) from anon");
    expect(sql).toContain("grant execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) to authenticated");
    expect(sql).not.toMatch(/create policy[\s\S]*user_saved_ai_recipe_cooked_batches[\s\S]*for (insert|update)/);
  });

  it("locks owned source rows in deterministic recipe, measurement, inventory and equivalence order", () => {
    expect(sql).toMatch(/from public\.user_saved_ai_recipes[\s\S]*for update/);
    expect(sql).toMatch(/from public\.user_saved_ai_recipe_ingredients[\s\S]*order by inventory_item_id, id[\s\S]*for update/);
    expect(sql).toMatch(/from public\.user_saved_ai_recipe_cooking_yields[\s\S]*for update/);
    expect(sql).toMatch(/select \* from pg_temp\.batch_lines order by item_id/);
    expect(sql).toMatch(/order by equivalence\.food_catalog_item_id, equivalence\.variant_key, equivalence\.id[\s\S]*for update/);
    expect(sql).toContain("where id = p_recipe_id and user_id = v_user_id");
    expect(sql).toContain("where id = v_line.item_id and user_id = v_user_id");
  });

  it("strictly reconciles one to twenty recipe ingredients with the untrusted lines", () => {
    expect(sql).toContain("if v_input_count < 1 or v_input_count > 20");
    expect(sql).toContain("(select count(*) from jsonb_object_keys(line)) in (2, 6)");
    expect(sql).toContain("full join pg_temp.batch_ingredients ingredient on ingredient.item_id = line.item_id");
    expect(sql).toContain("line.consumed_quantity <> ingredient.quantity");
    expect(sql).toContain("v_item.name <> (select name from pg_temp.batch_ingredients");
    expect(sql).toContain("v_item.unit <> (select unit from pg_temp.batch_ingredients");
  });

  it("derives snapshot data from locked recipe, measurement, inventory and equivalence rows", () => {
    expect(sql).toContain("v_recipe.title, v_measurement.raw_weight_g");
    expect(sql).toContain("v_measurement.cooked_weight_g, v_measurement.servings");
    expect(sql).toContain("v_total_calories := v_total_calories + v_line.calories * v_factor");
    expect(sql).toContain("or v_eq_updated_at <> v_line.expected_equivalence_updated_at");
    expect(sql).toContain("consumed_cooked_weight_g");
    expect(sql).toMatch(/v_total_carbs, v_total_fat, 0, v_fingerprint/);
  });

  it("uses the explicit request UUID idempotently and rejects incompatible reuse", () => {
    expect(sql).toContain("where id = p_request_id and user_id = v_user_id");
    expect(sql).toContain("v_existing.creation_fingerprint = v_fingerprint");
    expect(sql).toContain("return v_existing.id");
    expect(sql).toContain("message = 'idempotency_conflict'");
    expect(sql).toContain("creation_fingerprint, source_measurement_updated_at");
    expect(sql).toContain("new.creation_fingerprint is distinct from old.creation_fingerprint");
  });

  it("returns an already-created compatible request before revalidating mutable source rows", () => {
    expect(retrySql).toContain("rename to create_saved_ai_recipe_cooked_batch_impl");
    expect(retrySql).toContain("where id = p_request_id\n  for update");
    expect(retrySql).toContain("v_existing.user_id = v_user_id");
    expect(retrySql).toContain("v_existing.creation_fingerprint = v_fingerprint");
    expect(retrySql).toMatch(/if found then[\s\S]*return v_existing\.id;[\s\S]*return public\.create_saved_ai_recipe_cooked_batch_impl/);
    expect(retrySql).toContain("count(distinct item_id)");
    expect(retrySql).toContain("message = 'idempotency_conflict'");
  });

  it("keeps the internal implementation unreachable to authenticated callers", () => {
    expect(retrySql).toContain("revoke execute on function public.create_saved_ai_recipe_cooked_batch_impl(uuid, uuid, timestamptz, jsonb) from public");
    expect(retrySql).toContain("revoke execute on function public.create_saved_ai_recipe_cooked_batch_impl(uuid, uuid, timestamptz, jsonb) from anon");
    expect(retrySql).toContain("revoke execute on function public.create_saved_ai_recipe_cooked_batch_impl(uuid, uuid, timestamptz, jsonb) from authenticated");
    expect(retrySql).toContain("grant execute on function public.create_saved_ai_recipe_cooked_batch(uuid, uuid, timestamptz, jsonb) to authenticated");
  });

  it("preserves an immutable source identity after the live recipe relation is detached", () => {
    expect(sourceSql).toContain("rename column source_recipe_id to live_source_recipe_id");
    expect(sourceSql).toContain("add column source_recipe_id uuid");
    expect(sourceSql).toContain("new.live_source_recipe_id := new.source_recipe_id");
    expect(sourceSql).toContain("new.source_recipe_id is distinct from old.source_recipe_id");
    expect(sourceSql).toContain("old.live_source_recipe_id is not null and new.live_source_recipe_id is null");
    expect(sourceSql).toContain("creation_fingerprint is null");
  });

  it("aligns database and public measurement versions to canonical millisecond precision", () => {
    expect(sourceSql).toContain("alter column updated_at type timestamptz(3)");
    expect(sourceSql).toContain("alter column source_measurement_updated_at type timestamptz(3)");
    expect(sourceSql).toContain("date_trunc('milliseconds', updated_at)");
    expect(contract).toContain("MEASUREMENT_VERSION_PATTERN");
    expect(contract).toContain("parsed.toISOString() === value");
  });

  it("inserts the batch and then fully deletes or partially reduces inventory in the same function", () => {
    expect(sql).toContain("insert into public.user_saved_ai_recipe_cooked_batches");
    expect(sql).toContain("delete from public.inventory_items");
    expect(sql).toContain("update public.inventory_items set quantity = v_remaining");
    expect(sql).not.toContain("daily_meal_logs");
    expect(sql).not.toContain("daily_meal_log_items");
    expect(sql).not.toContain("target_calories");
  });

  it("keeps the existing cook-and-log operation untouched and adds a separate server action", () => {
    expect(action).toContain("export async function createSavedAiRecipeCookedBatchAction");
    expect(action).toContain('"create_saved_ai_recipe_cooked_batch"');
    expect(action.match(/export async function cookSavedAiRecipeAndLogMealAction/g)).toHaveLength(1);
  });
});