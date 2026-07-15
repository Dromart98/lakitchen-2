import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";
import type { RecipeAiInventoryItem, RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";

export function getUrgentRecipeAiInventoryItemIds(
  inventoryItems: readonly Pick<RecipeAiInventoryItem, "id" | "expires_at">[],
  todayKey: string,
  windowDays = 7,
): Set<string> {
  const urgentIds = new Set<string>();

  for (const item of inventoryItems) {
    if (!item.expires_at) continue;

    const dayDifference = getInventoryExpirationDayDifference(item.expires_at, todayKey);
    if (dayDifference >= 0 && dayDifference <= windowDays) {
      urgentIds.add(item.id);
    }
  }

  return urgentIds;
}

export function hasRecipeAiUrgencyCoverage(
  recipes: readonly RecipeAiSuggestion[],
  urgentInventoryItemIds: ReadonlySet<string>,
): boolean {
  if (urgentInventoryItemIds.size === 0) return false;

  return recipes.some((recipe) => recipe.ingredients.some((ingredient) => urgentInventoryItemIds.has(ingredient.inventory_item_id)));
}

type RecipeUrgencySortData = {
  recipe: RecipeAiSuggestion;
  originalIndex: number;
  nearestExpirationDayDifference: number;
  urgentItemCount: number;
};

function getRecipeUrgencySortData(
  recipe: RecipeAiSuggestion,
  originalIndex: number,
  inventoryById: Map<string, RecipeAiInventoryItem>,
  todayKey: string,
  windowDays: number,
): RecipeUrgencySortData {
  let nearestExpirationDayDifference = Number.POSITIVE_INFINITY;
  let urgentItemCount = 0;
  const countedUrgentIds = new Set<string>();

  for (const ingredient of recipe.ingredients) {
    const inventoryItem = inventoryById.get(ingredient.inventory_item_id);
    if (!inventoryItem?.expires_at) continue;

    const dayDifference = getInventoryExpirationDayDifference(inventoryItem.expires_at, todayKey);
    if (dayDifference < 0) continue;

    nearestExpirationDayDifference = Math.min(nearestExpirationDayDifference, dayDifference);

    if (dayDifference <= windowDays && !countedUrgentIds.has(inventoryItem.id)) {
      countedUrgentIds.add(inventoryItem.id);
      urgentItemCount += 1;
    }
  }

  return { recipe, originalIndex, nearestExpirationDayDifference, urgentItemCount };
}

export function sortRecipeAiSuggestionsByUrgency(
  recipes: readonly RecipeAiSuggestion[],
  inventoryItems: readonly RecipeAiInventoryItem[],
  todayKey: string,
): RecipeAiSuggestion[] {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

  return recipes
    .map((recipe, originalIndex) => getRecipeUrgencySortData(recipe, originalIndex, inventoryById, todayKey, 7))
    .sort((first, second) => {
      if (first.nearestExpirationDayDifference !== second.nearestExpirationDayDifference) {
        return first.nearestExpirationDayDifference - second.nearestExpirationDayDifference;
      }

      if (first.urgentItemCount !== second.urgentItemCount) {
        return second.urgentItemCount - first.urgentItemCount;
      }

      return first.originalIndex - second.originalIndex;
    })
    .map(({ recipe }) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      steps: [...recipe.steps],
    }));
}
