import { catalogRequestKey, findNutritionCatalogMatches, type NutritionCatalogFoodState } from "@/modules/nutrition/catalog";
import { getVoiceInventoryDraftStatus, type VoiceInventoryBatchResult, type VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";

type CatalogRequest = { name: string; foodState: NutritionCatalogFoodState; nutritionBasis: "per_100g" | "per_100ml" | "per_unit" };

export async function applyNutritionCatalogToVoiceBatch(client: any, userId: string, result: VoiceInventoryBatchResult): Promise<VoiceInventoryBatchResult> {
  if (result.status === "error") return result;
  const unique = new Map<string, CatalogRequest>();
  for (const item of result.items) {
    if (!item.nutrition_basis) continue;
    const request = { name: item.name, foodState: item.food_state, nutritionBasis: item.nutrition_basis } satisfies CatalogRequest;
    unique.set(catalogRequestKey(request.name, request.foodState, request.nutritionBasis), request);
  }
  if (!unique.size) return result;
  const matches = await findNutritionCatalogMatches(client, userId, [...unique.values()]);
  const items = result.items.map((item): VoiceInventoryDraftItem => {
    if (!item.nutrition_basis) return item;
    const match = matches.get(catalogRequestKey(item.name, item.food_state, item.nutrition_basis));
    if (!match) return item;
    return {
      ...item, calories: match.calories, protein_g: match.protein_g, carbs_g: match.carbs_g, fat_g: match.fat_g,
      confidence: match.user_confirmed ? "high" : item.confidence,
      issues: item.issues.filter((issue) => issue !== "nutrition-incomplete" && issue !== "nutrition-basis-mismatch" && (issue !== "low-confidence" || !match.user_confirmed)),
    };
  });
  return items.some((item) => getVoiceInventoryDraftStatus(item) !== "Listo")
    ? { status: "needs-clarification", items, message: "Revisa los productos marcados antes de la próxima fase." }
    : { status: "success", items };
}
