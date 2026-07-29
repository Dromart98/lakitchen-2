import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";
import { calculateConsumedInventoryNutrition } from "@/modules/inventory/inventory-nutrition";

type NutritionTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type RecipeNutritionEstimate = {
  total: NutritionTotals | null;
  perServing: NutritionTotals | null;
  isComplete: boolean;
  missingNutritionItemCount: number;
};

function getAllocationNutrition(allocation: RecipeIngredientAllocation) {
  return calculateConsumedInventoryNutrition({
    consumed_quantity: allocation.usedQuantity,
    unit: allocation.usedUnit,
    nutrition_basis: allocation.nutritionBasis,
    calories: allocation.calories,
    protein_g: allocation.proteinG,
    carbs_g: allocation.carbsG,
    fat_g: allocation.fatG,
    confirmedUnitMeasure: allocation.confirmedUnitMeasure,
  });
}

function countMissingNutritionItems(allocations: RecipeIngredientAllocation[]): number {
  const missingItemIds = new Set<string>();

  for (const allocation of allocations) {
    const nutrition = getAllocationNutrition(allocation);
    if (!nutrition || [nutrition.calories, nutrition.protein_g, nutrition.carbs_g, nutrition.fat_g].some((value) => value === null || !Number.isFinite(value))) {
      missingItemIds.add(allocation.inventoryItemId);
    }
  }

  return missingItemIds.size;
}

export function estimateRecipeNutrition(
  allocations: RecipeIngredientAllocation[],
  servings: number,
): RecipeNutritionEstimate {
  const missingNutritionItemCount = countMissingNutritionItems(allocations);

  if (allocations.length === 0 || missingNutritionItemCount > 0 || !Number.isFinite(servings) || servings <= 0) {
    return {
      total: null,
      perServing: null,
      isComplete: false,
      missingNutritionItemCount,
    };
  }

  const total = allocations.reduce<NutritionTotals>((sum, allocation) => {
    const nutrition = getAllocationNutrition(allocation);
    if (!nutrition || nutrition.calories === null || nutrition.protein_g === null || nutrition.carbs_g === null || nutrition.fat_g === null) {
      return sum;
    }

    return {
      calories: sum.calories + nutrition.calories,
      proteinG: sum.proteinG + nutrition.protein_g,
      carbsG: sum.carbsG + nutrition.carbs_g,
      fatG: sum.fatG + nutrition.fat_g,
    };
  }, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

  return {
    total,
    perServing: {
      calories: total.calories / servings,
      proteinG: total.proteinG / servings,
      carbsG: total.carbsG / servings,
      fatG: total.fatG / servings,
    },
    isComplete: true,
    missingNutritionItemCount: 0,
  };
}
