import type { RecipeAiNutritionInventoryItem } from "@/modules/recipes/recipe-ai-nutrition";
import { buildRecipeAiNutritionAllocations } from "@/modules/recipes/recipe-ai-nutrition";
import type { RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";
import { estimateRecipeNutrition, type RecipeNutritionEstimate } from "@/modules/recipes/recipe-nutrition";

/** The smaller cap prevents a percentage rounding allowance becoming large at high targets. */
export const RECIPE_CALORIE_TOLERANCE_MAX_KCAL = 50;
export const RECIPE_CALORIE_TOLERANCE_PERCENT = 0.05;
const MINIMUM_REASONABLE_RECIPE_SCALE = 0.5;

export type RecipeCalorieBudget = {
  dailyTargetCalories: number;
  consumedCalories: number;
  remainingCalories: number;
};

export type RecipeCalorieValidation = {
  status: "within-budget" | "adjusted" | "not-viable" | "unavailable";
  remainingCalories: number | null;
  toleranceCalories: number | null;
};

export type RecipeWithCalorieValidation = RecipeAiSuggestion & {
  nutrition: RecipeNutritionEstimate;
  calorieValidation: RecipeCalorieValidation;
};

export function buildRecipeCalorieBudget(dailyTargetCalories: number | null, consumedCalories: number): RecipeCalorieBudget | null {
  if (!Number.isFinite(dailyTargetCalories) || dailyTargetCalories === null || dailyTargetCalories <= 0 || !Number.isFinite(consumedCalories)) return null;
  return {
    dailyTargetCalories,
    consumedCalories: Math.max(0, consumedCalories),
    remainingCalories: Math.max(0, dailyTargetCalories - Math.max(0, consumedCalories)),
  };
}

export function getRecipeCalorieTolerance(remainingCalories: number): number {
  if (!Number.isFinite(remainingCalories) || remainingCalories < 0) return 0;
  return Math.min(RECIPE_CALORIE_TOLERANCE_MAX_KCAL, remainingCalories * RECIPE_CALORIE_TOLERANCE_PERCENT);
}

export function isRecipeServingWithinCalorieBudget(caloriesPerServing: number, budget: RecipeCalorieBudget): boolean {
  return Number.isFinite(caloriesPerServing) && caloriesPerServing <= budget.remainingCalories + getRecipeCalorieTolerance(budget.remainingCalories);
}

function nutritionFor(recipe: RecipeAiSuggestion, inventory: RecipeAiNutritionInventoryItem[]): RecipeNutritionEstimate {
  const { allocations, missingItemIds } = buildRecipeAiNutritionAllocations(recipe, new Map(inventory.map((item) => [item.id, item])));
  const nutrition = estimateRecipeNutrition(allocations, recipe.servings);
  return missingItemIds.size === 0 ? nutrition : { total: null, perServing: null, isComplete: false, missingNutritionItemCount: missingItemIds.size + nutrition.missingNutritionItemCount, usedConfirmedUnitMeasure: nutrition.usedConfirmedUnitMeasure };
}

function scaleRecipe(recipe: RecipeAiSuggestion, scale: number): RecipeAiSuggestion | null {
  if (!Number.isFinite(scale) || scale < MINIMUM_REASONABLE_RECIPE_SCALE || scale >= 1) return null;
  const ingredients = recipe.ingredients.map((ingredient) => {
    const quantity = ingredient.quantity * scale;
    return Number.isFinite(quantity) && quantity > 0 ? { ...ingredient, quantity: Math.round(quantity * 100) / 100 } : null;
  });
  if (ingredients.some((ingredient) => ingredient === null)) return null;
  return { ...recipe, ingredients: ingredients as RecipeAiSuggestion["ingredients"] };
}

export function validateAndAdjustAiRecipeCalories(recipe: RecipeAiSuggestion, inventory: RecipeAiNutritionInventoryItem[], budget: RecipeCalorieBudget | null): RecipeWithCalorieValidation {
  const nutrition = nutritionFor(recipe, inventory);
  if (!budget) return { ...recipe, nutrition, calorieValidation: { status: "unavailable", remainingCalories: null, toleranceCalories: null } };
  const validation = { remainingCalories: budget.remainingCalories, toleranceCalories: getRecipeCalorieTolerance(budget.remainingCalories) };
  if (!nutrition.isComplete || !nutrition.perServing) return { ...recipe, nutrition, calorieValidation: { status: "not-viable", ...validation } };
  if (isRecipeServingWithinCalorieBudget(nutrition.perServing.calories, budget)) return { ...recipe, nutrition, calorieValidation: { status: "within-budget", ...validation } };

  const scale = budget.remainingCalories / nutrition.perServing.calories;
  const adjustedRecipe = scaleRecipe(recipe, scale);
  if (!adjustedRecipe) return { ...recipe, nutrition, calorieValidation: { status: "not-viable", ...validation } };
  const adjustedNutrition = nutritionFor(adjustedRecipe, inventory);
  if (!adjustedNutrition.isComplete || !adjustedNutrition.perServing || !isRecipeServingWithinCalorieBudget(adjustedNutrition.perServing.calories, budget)) {
    return { ...recipe, nutrition, calorieValidation: { status: "not-viable", ...validation } };
  }
  return { ...adjustedRecipe, nutrition: adjustedNutrition, calorieValidation: { status: "adjusted", ...validation } };
}
