import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";
import { calculateConsumedInventoryNutritionWithMetadata } from "@/modules/inventory/inventory-nutrition";

export type NutritionTotals = {
  readonly calories: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
};

export type RecipeNutritionEstimate = {
  total: NutritionTotals | null;
  perServing: NutritionTotals | null;
  isComplete: boolean;
  missingNutritionItemCount: number;
  usedConfirmedUnitMeasure: boolean;
};

function getAllocationNutrition(allocation: RecipeIngredientAllocation) {
  return calculateConsumedInventoryNutritionWithMetadata({
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
    if (!nutrition || [nutrition.nutrition.calories, nutrition.nutrition.protein_g, nutrition.nutrition.carbs_g, nutrition.nutrition.fat_g].some((value) => value === null || !Number.isFinite(value))) {
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
      usedConfirmedUnitMeasure: false,
    };
  }

  const total = allocations.reduce<NutritionTotals>((sum, allocation) => {
    const nutrition = getAllocationNutrition(allocation);
    if (!nutrition || nutrition.nutrition.calories === null || nutrition.nutrition.protein_g === null || nutrition.nutrition.carbs_g === null || nutrition.nutrition.fat_g === null) {
      return sum;
    }
    const values = nutrition.nutrition;

    return {
      calories: sum.calories + values.calories!,
      proteinG: sum.proteinG + values.protein_g!,
      carbsG: sum.carbsG + values.carbs_g!,
      fatG: sum.fatG + values.fat_g!,
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
    usedConfirmedUnitMeasure: allocations.some((allocation) => getAllocationNutrition(allocation)?.usedConfirmedUnitMeasure === true),
  };
}
