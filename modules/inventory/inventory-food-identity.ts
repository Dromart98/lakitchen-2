import { normalizeNutritionCatalogName } from "@/modules/nutrition/catalog";

export function planInventoryFoodIdentityUpdate(input: {
  currentName: string;
  currentFoodCatalogItemId: string | null;
  nextName: string;
  explicitlyResolvedFoodCatalogItemId: string | null;
  hasCompleteNutrition: boolean;
}) {
  const sameName = normalizeNutritionCatalogName(input.currentName) === normalizeNutritionCatalogName(input.nextName);
  if (!sameName && !input.explicitlyResolvedFoodCatalogItemId) {
    return {
      shouldPersistConfirmedNutrition: false,
      catalogFoodCatalogItemId: null,
      fallbackFoodCatalogItemId: null,
    };
  }

  const identity = input.explicitlyResolvedFoodCatalogItemId ?? input.currentFoodCatalogItemId;
  return {
    shouldPersistConfirmedNutrition: input.hasCompleteNutrition,
    catalogFoodCatalogItemId: identity,
    fallbackFoodCatalogItemId: identity,
  };
}
