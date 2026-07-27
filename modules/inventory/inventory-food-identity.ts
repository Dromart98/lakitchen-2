import { normalizeNutritionCatalogName } from "@/modules/nutrition/catalog";

export function getInventoryFoodIdentityUpdate(input: {
  currentName: string;
  currentFoodCatalogItemId: string | null;
  nextName: string;
  resolvedFoodCatalogItemId: string | null;
  hasCompleteNutrition: boolean;
}) {
  const sameName = normalizeNutritionCatalogName(input.currentName) === normalizeNutritionCatalogName(input.nextName);
  if (!sameName && !input.hasCompleteNutrition) return { food_catalog_item_id: null };
  if (input.hasCompleteNutrition) {
    return { food_catalog_item_id: input.resolvedFoodCatalogItemId ?? (sameName ? input.currentFoodCatalogItemId : null) };
  }
  return {};
}
