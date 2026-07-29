import "server-only";

import { selectInventoryUnitMeasures, type InventoryConfirmedUnitMeasure } from "@/modules/inventory/inventory-unit-equivalence";
import type { RecipeAiNutritionInventoryItem } from "@/modules/recipes/recipe-ai-nutrition";

type UnitMeasureQuery = {
  select(columns: string): UnitMeasureQuery;
  eq(column: string, value: string | boolean): UnitMeasureQuery;
  in(column: string, values: string[]): Promise<unknown>;
};

export type RecipeAiUnitMeasureClient = { from(table: string): UnitMeasureQuery };

export function collectRecipeAiFoodIdentityIds(items: readonly RecipeAiNutritionInventoryItem[]): string[] {
  return [...new Set(items.flatMap((item) =>
    typeof item.food_catalog_item_id === "string" && item.food_catalog_item_id.length > 0
      ? [item.food_catalog_item_id]
      : [],
  ))];
}

export function attachRecipeAiUnitMeasures<T extends RecipeAiNutritionInventoryItem>(
  items: readonly T[],
  measures: ReadonlyMap<string, InventoryConfirmedUnitMeasure>,
): Array<T & { confirmedUnitMeasure: InventoryConfirmedUnitMeasure | null }> {
  return items.map((item) => ({
    ...item,
    confirmedUnitMeasure: typeof item.food_catalog_item_id === "string"
      ? measures.get(item.food_catalog_item_id) ?? null
      : null,
  }));
}

export async function loadAndAttachRecipeAiUnitMeasures<T extends RecipeAiNutritionInventoryItem>(
  client: RecipeAiUnitMeasureClient,
  userId: string,
  items: readonly T[],
  logContext: string,
): Promise<Array<T & { confirmedUnitMeasure: InventoryConfirmedUnitMeasure | null }>> {
  const identityIds = collectRecipeAiFoodIdentityIds(items);
  if (identityIds.length === 0) return attachRecipeAiUnitMeasures(items, new Map());

  const { data, error } = await client
    .from("food_quantity_equivalences")
    .select("id, food_catalog_item_id, user_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed, updated_at")
    .eq("user_id", userId)
    .eq("measure_kind", "unit")
    .eq("user_confirmed", true)
    .eq("source", "user")
    .in("food_catalog_item_id", identityIds) as { data: unknown[] | null; error: { message: string } | null };

  if (error) {
    console.warn(`Supabase could not load ${logContext} unit measures:`, error.message);
    return attachRecipeAiUnitMeasures(items, new Map());
  }

  return attachRecipeAiUnitMeasures(items, selectInventoryUnitMeasures(data ?? [], userId, identityIds));
}
