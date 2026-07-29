import { matchRecipesToInventory, type RecipeInventoryItem, type RecipeMatchResult, type RecipeTemplate } from "@/modules/recipes/recipe-matching";
import { estimateRecipeNutrition, type RecipeNutritionEstimate } from "@/modules/recipes/recipe-nutrition";

export type ScaleRecipeToServingsResult =
  | { ok: true; recipe: RecipeTemplate; scale: number }
  | { ok: false; code: "invalid-recipe-servings" | "invalid-requested-servings" | "invalid-scaled-quantity" };

export type RecipeServingOption = {
  servings: number;
  canCookNow: boolean;
  nutrition: RecipeNutritionEstimate | null;
  canLog: boolean;
  urgentItemCount: number;
  nearestExpirationDate: string | null;
  usedConfirmedUnitMeasure: boolean;
};

export type RecipeMatchWithServingOptions = {
  match: RecipeMatchResult;
  servingOptions: RecipeServingOption[];
  maxCookableServings: number;
  loggableServingOptions: RecipeServingOption[];
};

const MAX_RECIPE_MEAL_NAME_LENGTH = 120;

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
      options.push({ servings, canCookNow: false, nutrition: null, canLog: false, urgentItemCount: 0, nearestExpirationDate: null, usedConfirmedUnitMeasure: false });
      continue;
    }

    const allocations = match.ingredientMatches.flatMap((ingredientMatch) => ingredientMatch.allocations);
    const nutrition = estimateRecipeNutrition(allocations, match.recipe.servings);
    const canLog = nutrition.isComplete && Boolean(nutrition.total) && Boolean(nutrition.perServing);
    options.push({ servings, canCookNow, nutrition, canLog, urgentItemCount: match.urgentItemCount, nearestExpirationDate: match.nearestExpirationDate, usedConfirmedUnitMeasure: allocations.some((allocation) => allocation.usedConfirmedUnitMeasure) });
  }

  return options;
}

export function getMaxCookableRecipeServings(recipe: RecipeTemplate, inventory: RecipeInventoryItem[], todayKey: string): number {
  return getRecipeServingOptions(recipe, inventory, todayKey).reduce((maxServings, option) => (option.canCookNow ? option.servings : maxServings), 0);
}

export function buildRecipeMatchWithServingOptions(match: RecipeMatchResult, inventory: RecipeInventoryItem[], todayKey: string): RecipeMatchWithServingOptions {
  const servingOptions = getRecipeServingOptions(match.recipe, inventory, todayKey);
  const maxCookableServings = servingOptions.reduce((maxServings, option) => (option.canCookNow ? option.servings : maxServings), 0);
  const loggableServingOptions = servingOptions.filter((option) => option.canLog && option.nutrition?.total);

  return { match, servingOptions, maxCookableServings, loggableServingOptions };
}

export function filterRecipeMatchesWithServingOptions(items: RecipeMatchWithServingOptions[], mode: string | undefined): RecipeMatchWithServingOptions[] {
  if (mode === "available") return items.filter((item) => item.servingOptions.some((option) => option.canCookNow));
  if (mode === "quick") return items.filter((item) => item.match.recipe.prep_minutes <= 15 && item.servingOptions.some((option) => option.canCookNow));
  if (mode === "urgent") return items.filter((item) => item.servingOptions.some((option) => option.canCookNow && option.urgentItemCount > 0));
  return [...items];
}

export function getMaxUrgentItemCountForCookableServings(servingOptions: RecipeServingOption[]): number {
  return servingOptions.reduce((maxCount, option) => (option.canCookNow ? Math.max(maxCount, option.urgentItemCount) : maxCount), 0);
}

export function buildRecipeMealName(title: string, servings: number): string {
  const safeServings = isSafePositiveInteger(servings) ? servings : 1;
  const suffix = ` · ${safeServings} ${safeServings === 1 ? "ración" : "raciones"}`;
  const maxTitleLength = Math.max(0, MAX_RECIPE_MEAL_NAME_LENGTH - Array.from(suffix).length);
  const safeTitle = Array.from(title).slice(0, maxTitleLength).join("").trimEnd();

  return `${safeTitle}${suffix}`;
}
