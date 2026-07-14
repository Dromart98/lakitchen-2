import { matchRecipesToInventory, type RecipeInventoryItem, type RecipeTemplate } from "@/modules/recipes/recipe-matching";
import { estimateRecipeNutrition, type RecipeNutritionEstimate } from "@/modules/recipes/recipe-nutrition";

export type ScaleRecipeToServingsResult =
  | { ok: true; recipe: RecipeTemplate; scale: number }
  | { ok: false; code: "invalid-recipe-servings" | "invalid-requested-servings" | "invalid-scaled-quantity" };

export type RecipeServingOption = {
  servings: number;
  canCookNow: boolean;
  nutrition: RecipeNutritionEstimate | null;
  canLog: boolean;
};

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function scaleRecipeToServings(recipe: RecipeTemplate, requestedServings: number): ScaleRecipeToServingsResult {
  if (!isSafePositiveInteger(recipe.servings)) return { ok: false, code: "invalid-recipe-servings" };
  if (!Number.isSafeInteger(requestedServings) || requestedServings < 1 || requestedServings > recipe.servings) {
    return { ok: false, code: "invalid-requested-servings" };
  }

  const scale = requestedServings / recipe.servings;
  if (!Number.isFinite(scale) || scale <= 0) return { ok: false, code: "invalid-scaled-quantity" };

  const recipeIngredients = recipe.recipe_ingredients.map((ingredient) => {
    const requiredQuantity = ingredient.required_quantity * scale;
    if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
      return null;
    }

    return { ...ingredient, required_quantity: requiredQuantity };
  });

  if (recipeIngredients.some((ingredient) => ingredient === null)) {
    return { ok: false, code: "invalid-scaled-quantity" };
  }

  return {
    ok: true,
    scale,
    recipe: {
      ...recipe,
      servings: requestedServings,
      instructions: [...recipe.instructions],
      recipe_ingredients: recipeIngredients as RecipeTemplate["recipe_ingredients"],
    },
  };
}

export function getRecipeServingOptions(recipe: RecipeTemplate, inventory: RecipeInventoryItem[], todayKey: string): RecipeServingOption[] {
  if (!isSafePositiveInteger(recipe.servings)) return [];

  const options: RecipeServingOption[] = [];
  for (let servings = 1; servings <= recipe.servings; servings += 1) {
    const scaledRecipe = scaleRecipeToServings(recipe, servings);
    if (!scaledRecipe.ok) continue;

    const [match] = matchRecipesToInventory([scaledRecipe.recipe], inventory, todayKey);
    const canCookNow = match?.canCookNow === true;
    if (!canCookNow || !match) {
      options.push({ servings, canCookNow: false, nutrition: null, canLog: false });
      continue;
    }

    const allocations = match.ingredientMatches.flatMap((ingredientMatch) => ingredientMatch.allocations);
    const nutrition = estimateRecipeNutrition(allocations, match.recipe.servings);
    const canLog = nutrition.isComplete && Boolean(nutrition.total) && Boolean(nutrition.perServing);
    options.push({ servings, canCookNow, nutrition, canLog });
  }

  return options;
}

export function getMaxCookableRecipeServings(recipe: RecipeTemplate, inventory: RecipeInventoryItem[], todayKey: string): number {
  return getRecipeServingOptions(recipe, inventory, todayKey).reduce((maxServings, option) => (option.canCookNow ? option.servings : maxServings), 0);
}
