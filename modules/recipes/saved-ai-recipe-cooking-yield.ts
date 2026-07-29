import type { RecipeAiNutritionInventoryItem } from "@/modules/recipes/recipe-ai-nutrition";
import { buildRecipeAiNutritionAllocations } from "@/modules/recipes/recipe-ai-nutrition";
import { estimateRecipeNutrition, type NutritionTotals } from "@/modules/recipes/recipe-nutrition";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

export type SavedRecipeCookingYieldNutrition =
  | Readonly<{ status: "complete"; total: Readonly<NutritionTotals> }>
  | Readonly<{ status: "incomplete"; itemsToReview: number }>;

/** Builds the minimal public nutrition projection for the non-persistent yield preview. */
export function buildSavedRecipeCookingYieldNutrition(
  recipe: SavedAiRecipe,
  inventoryById: Map<string, RecipeAiNutritionInventoryItem>,
): SavedRecipeCookingYieldNutrition {
  const suggestion = {
    title: recipe.title,
    description: recipe.description,
    estimated_minutes: recipe.estimated_minutes,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map(({ inventory_item_id, name, quantity, unit }) => ({
      inventory_item_id,
      name,
      quantity,
      unit,
    })),
    steps: recipe.steps,
  };
  const { allocations, missingItemIds } = buildRecipeAiNutritionAllocations(suggestion, inventoryById);
  const nutrition = estimateRecipeNutrition(allocations, recipe.servings);
  const itemsToReview = missingItemIds.size + nutrition.missingNutritionItemCount;

  if (itemsToReview > 0 || !nutrition.isComplete || !nutrition.total) {
    return Object.freeze({ status: "incomplete", itemsToReview: Math.max(1, itemsToReview) });
  }

  return Object.freeze({ status: "complete", total: Object.freeze({ ...nutrition.total }) });
}
