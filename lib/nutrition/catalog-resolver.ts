import { resolveInventoryNutrition } from "@/lib/nutrition/hybrid-resolver";
import { catalogBasisForUnit, catalogRequestKey, catalogRowFromResolution, findNutritionCatalogMatches, inferCatalogFoodState, persistNutritionCatalogRow } from "@/modules/nutrition/catalog";
import type { InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import type { NutritionResolution } from "@/modules/nutrition/resolution";

export async function resolveInventoryNutritionForUser(client: any, userId: string, input: InventoryNutritionAiInput, options: Parameters<typeof resolveInventoryNutrition>[1] = {}): Promise<NutritionResolution> {
  const foodState = inferCatalogFoodState(input.name);
  const nutritionBasis = catalogBasisForUnit(input.unit);
  let hit;
  try {
    const matches = await findNutritionCatalogMatches(client, userId, [{ name: input.name, foodState, nutritionBasis }]);
    hit = matches.get(catalogRequestKey(input.name, foodState, nutritionBasis));
  } catch (error) {
    console.warn("Supabase could not read the nutrition catalog:", error instanceof Error ? error.message : error);
  }
  if (hit) return { status: "resolved", normalizedName: hit.normalized_name, foodState: hit.food_state === "drained" || hit.food_state === "frozen" ? "unknown" : hit.food_state,
    nutritionBasis: hit.nutrition_basis, calories: hit.calories, proteinG: hit.protein_g, carbsG: hit.carbs_g, fatG: hit.fat_g,
    needsReview: !hit.user_confirmed, provenance: { source: hit.source, externalId: hit.external_id ?? undefined, resolvedAt: hit.resolved_at }, assumptions: "Revisa los valores antes de guardar." };
  const resolution = await resolveInventoryNutrition(input, options);
  if (resolution.status === "resolved") {
    const compatibleFoodState = foodState === "drained" || foodState === "frozen" ? "unknown" : foodState;
    try { await persistNutritionCatalogRow(client, catalogRowFromResolution(userId, input.name, { ...resolution, foodState: compatibleFoodState })); }
    catch (error) { console.warn("Supabase could not cache resolved nutrition:", error instanceof Error ? error.message : error); }
  }
  return resolution;
}
