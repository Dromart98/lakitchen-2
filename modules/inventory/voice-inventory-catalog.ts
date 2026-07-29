import { catalogRequestKey, findNutritionCatalogMatches, type NutritionCatalogFoodState } from "@/modules/nutrition/catalog";
import { getVoiceInventoryDraftStatus, normalizeVoiceInventoryDraftItem, type VoiceInventoryBatchResult, type VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";
import { toFoodQuantityEquivalence, type ConfirmedFoodQuantityEquivalence } from "@/modules/units/food-quantity-equivalence";

type CatalogRequest = { name: string; foodState: NutritionCatalogFoodState; nutritionBasis: "per_100g" | "per_100ml" | "per_unit" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EQUIVALENCE_COLUMNS = "id,food_catalog_item_id,measure_kind,variant_key,display_label,canonical_quantity,canonical_unit,source,user_confirmed,updated_at";

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
  let items = result.items.map((item): VoiceInventoryDraftItem => {
    if (!item.nutrition_basis) return item;
    const match = matches.get(catalogRequestKey(item.name, item.food_state, item.nutrition_basis));
    if (!match) return item;
    return {
      ...item, calories: match.calories, protein_g: match.protein_g, carbs_g: match.carbs_g, fat_g: match.fat_g,
      confidence: match.user_confirmed ? "high" : item.confidence,
      issues: item.issues.filter((issue) => issue !== "nutrition-incomplete" && issue !== "nutrition-basis-mismatch" && (issue !== "low-confidence" || !match.user_confirmed)),
    };
  });
  const identities = [...new Set([...matches.values()].map((match) => match.food_catalog_item_id).filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  if (identities.length) {
    try {
      const response = await client.from("food_quantity_equivalences").select(EQUIVALENCE_COLUMNS)
        .eq("user_id", userId).eq("user_confirmed", true).in("food_catalog_item_id", identities);
      if (response.error) throw new Error(response.error.message);
      const confirmed: ConfirmedFoodQuantityEquivalence[] = [];
      for (const [index, row] of (response.data ?? []).entries()) {
        const equivalence = toFoodQuantityEquivalence(row);
        if (equivalence?.state === "confirmed") confirmed.push(equivalence);
        else console.warn("Supabase returned an invalid confirmed food quantity equivalence row:", { index, row });
      }
      items = items.map((item) => {
        if (!item.nutrition_basis || !item.package_count || item.package_count <= 0 || !item.package_measure_kind
          || item.package_size !== null || item.package_size_unit !== null
          || item.total_size !== null || item.total_size_unit !== null) return item;
        const identity = matches.get(catalogRequestKey(item.name, item.food_state, item.nutrition_basis))?.food_catalog_item_id;
        if (!identity || !UUID.test(identity)) return item;
        const variants = confirmed.filter((entry) => entry.foodCatalogItemId === identity && entry.measureKind === item.package_measure_kind);
        if (variants.length !== 1 || (variants[0].canonicalUnit !== "g" && variants[0].canonicalUnit !== "ml")) return item;
        return { ...normalizeVoiceInventoryDraftItem({
          ...item,
          package_size: variants[0].canonicalQuantity,
          package_size_unit: variants[0].canonicalUnit,
          total_size: null,
          total_size_unit: null,
          issues: [...new Set([...item.issues, "saved-package-measure-applied" as const])],
        }), client_id: item.client_id, review_acknowledged: false };
      });
    } catch (error) {
      console.warn("Supabase could not apply confirmed package measures to the voice draft:", error instanceof Error ? error.message : error);
    }
  }
  return items.some((item) => getVoiceInventoryDraftStatus(item) !== "Listo")
    ? { status: "needs-clarification", items, message: "Revisa los productos marcados antes de la próxima fase." }
    : { status: "success", items };
}
