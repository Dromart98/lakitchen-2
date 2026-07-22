import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";
import { estimateRecipeNutrition, type RecipeNutritionEstimate } from "@/modules/recipes/recipe-nutrition";
import type { RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";

export type RecipeAiNutritionInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category?: string | null;
  expires_at: string | null;
  nutrition_basis?: InventoryNutritionBasis | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export type RecipeAiSuggestionWithNutrition = RecipeAiSuggestion & {
  nutrition: RecipeNutritionEstimate;
  calorieValidation?: {
    status: "within-budget" | "adjusted" | "not-viable" | "unavailable";
    remainingCalories: number | null;
    toleranceCalories: number | null;
  };
};

type BaseUnit = "g" | "ml" | "ud";

export function convertRecipeAiQuantityToBase(quantity: number, unit: string): { quantity: number; unit: BaseUnit } | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  if (unit === "g") return { quantity, unit: "g" };
  if (unit === "kg") return { quantity: quantity * 1000, unit: "g" };
  if (unit === "ml") return { quantity, unit: "ml" };
  if (unit === "l") return { quantity: quantity * 1000, unit: "ml" };
  if (unit === "ud") return { quantity, unit: "ud" };

  return null;
}

function buildIncompleteNutritionEstimate(missingNutritionItemCount: number): RecipeNutritionEstimate {
  return {
    total: null,
    perServing: null,
    isComplete: false,
    missingNutritionItemCount,
  };
}

export function buildRecipeAiNutritionAllocations(
  recipe: RecipeAiSuggestion,
  inventoryById: Map<string, RecipeAiNutritionInventoryItem>,
): { allocations: RecipeIngredientAllocation[]; missingItemIds: Set<string> } {
  const allocations: RecipeIngredientAllocation[] = [];
  const missingItemIds = new Set<string>();

  for (const ingredient of recipe.ingredients) {
    const inventoryItem = inventoryById.get(ingredient.inventory_item_id);
    const converted = convertRecipeAiQuantityToBase(ingredient.quantity, ingredient.unit);

    if (!inventoryItem || !converted) {
      missingItemIds.add(ingredient.inventory_item_id);
      continue;
    }

    allocations.push({
      inventoryItemId: inventoryItem.id,
      inventoryItemName: inventoryItem.name,
      usedQuantity: converted.quantity,
      usedUnit: converted.unit,
      nutritionBasis: inventoryItem.nutrition_basis ?? null,
      calories: inventoryItem.calories ?? null,
      proteinG: inventoryItem.protein_g ?? null,
      carbsG: inventoryItem.carbs_g ?? null,
      fatG: inventoryItem.fat_g ?? null,
    });
  }

  return { allocations, missingItemIds };
}

export function enrichRecipeAiSuggestionsWithNutrition(
  recipes: RecipeAiSuggestion[],
  inventoryItems: RecipeAiNutritionInventoryItem[],
): RecipeAiSuggestionWithNutrition[] {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

  return recipes.map((recipe) => {
    const { allocations, missingItemIds } = buildRecipeAiNutritionAllocations(recipe, inventoryById);
    const estimatedNutrition = estimateRecipeNutrition(allocations, recipe.servings);
    const nutrition = missingItemIds.size > 0
      ? buildIncompleteNutritionEstimate(missingItemIds.size + estimatedNutrition.missingNutritionItemCount)
      : estimatedNutrition;

    return {
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      steps: [...recipe.steps],
      nutrition,
    };
  });
}
