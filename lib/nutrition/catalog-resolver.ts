import { resolveInventoryNutrition } from "@/lib/nutrition/hybrid-resolver";
import { createLogger } from "@/lib/server/logger";
import { catalogBasisForUnit, catalogRequestKey, catalogRowFromResolution, findNutritionCatalogMatches, inferCatalogFoodState, persistNutritionCatalogRowWithIdentity } from "@/modules/nutrition/catalog";
import type { InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import type { NutritionResolution } from "@/modules/nutrition/resolution";

export async function resolveInventoryNutritionForUser(client: any, userId: string, input: InventoryNutritionAiInput, options: Parameters<typeof resolveInventoryNutrition>[1] = {}): Promise<NutritionResolution & { foodCatalogItemId?: string | null; meteringCacheHit?: boolean }> {
  const logger = createLogger("nutrition", "resolve_inventory_nutrition");
  const foodState = inferCatalogFoodState(input.name);
  const nutritionBasis = catalogBasisForUnit(input.unit);
  let hit;
  try {
    const matches = await findNutritionCatalogMatches(client, userId, [{ name: input.name, foodState, nutritionBasis }]);
    hit = matches.get(catalogRequestKey(input.name, foodState, nutritionBasis));
  } catch (error) {
    logger.warn("catalog_read_failed", { error });
  }
  if (hit) return { status: "resolved", normalizedName: hit.normalized_name, foodState: hit.food_state === "drained" || hit.food_state === "frozen" ? "unknown" : hit.food_state,
    nutritionBasis: hit.nutrition_basis, calories: hit.calories, proteinG: hit.protein_g, carbsG: hit.carbs_g, fatG: hit.fat_g,
    needsReview: !hit.user_confirmed, provenance: { source: hit.source, externalId: hit.external_id ?? undefined, resolvedAt: hit.resolved_at }, assumptions: "Revisa los valores antes de guardar.", foodCatalogItemId: hit.food_catalog_item_id ?? null, meteringCacheHit: true };
  const resolution = await resolveInventoryNutrition(input, options);
  if (resolution.status === "resolved") {
    const compatibleFoodState = foodState === "drained" || foodState === "frozen" ? "unknown" : foodState;
    try {
      const persisted = await persistNutritionCatalogRowWithIdentity(client, catalogRowFromResolution(userId, input.name, { ...resolution, foodState: compatibleFoodState }));
      return { ...resolution, foodCatalogItemId: persisted.foodCatalogItemId };
    }
    catch (error) { logger.warn("catalog_write_failed", { error }); }
  }
  return resolution;
}
