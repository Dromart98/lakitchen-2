import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";

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

function getNutritionFactor(allocation: RecipeIngredientAllocation): number | null {
  if (!Number.isFinite(allocation.usedQuantity) || allocation.usedQuantity <= 0) return null;

  if (allocation.nutritionBasis === "per_100g") return allocation.usedUnit === "g" ? allocation.usedQuantity / 100 : null;
  if (allocation.nutritionBasis === "per_100ml") return allocation.usedUnit === "ml" ? allocation.usedQuantity / 100 : null;
  if (allocation.nutritionBasis === "per_unit") return allocation.usedUnit === "ud" ? allocation.usedQuantity : null;

  return null;
}

function hasCompleteNutritionValues(allocation: RecipeIngredientAllocation): boolean {
  return [allocation.calories, allocation.proteinG, allocation.carbsG, allocation.fatG].every(
    (value) => value !== null && Number.isFinite(value),
  );
}

function isAllocationComplete(allocation: RecipeIngredientAllocation): boolean {
  return getNutritionFactor(allocation) !== null && hasCompleteNutritionValues(allocation);
}

function countMissingNutritionItems(allocations: RecipeIngredientAllocation[]): number {
  const missingItemIds = new Set<string>();

  for (const allocation of allocations) {
    if (!isAllocationComplete(allocation)) {
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
    const factor = getNutritionFactor(allocation);

    if (factor === null || allocation.calories === null || allocation.proteinG === null || allocation.carbsG === null || allocation.fatG === null) {
      return sum;
    }

    return {
      calories: sum.calories + allocation.calories * factor,
      proteinG: sum.proteinG + allocation.proteinG * factor,
      carbsG: sum.carbsG + allocation.carbsG * factor,
      fatG: sum.fatG + allocation.fatG * factor,
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
