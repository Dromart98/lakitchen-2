import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";
import { isMealType, type MealType } from "@/modules/meals/meal-types";
import { buildRecipeAiNutritionAllocations, type RecipeAiNutritionInventoryItem } from "@/modules/recipes/recipe-ai-nutrition";
import { buildRecipeConsumptionLines, type RecipeConsumptionLine } from "@/modules/recipes/recipe-consumption";
import type { RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";
import { RECIPE_MAX_INGREDIENTS } from "@/modules/recipes/recipe-limits";
import type { SavedAiRecipe } from "@/modules/recipes/saved-ai-recipes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOP_LEVEL_KEYS = ["recipe_id", "meal_type"] as const;

export type SavedAiRecipeCookErrorCode =
  | "invalid-input"
  | "unauthenticated"
  | "recipe-not-found"
  | "recipe-corrupt"
  | "recipe-stale"
  | "insufficient-stock"
  | "expired-item"
  | "nutrition-unavailable"
  | "incompatible-unit"
  | "too-many-items"
  | "consumption-conflict"
  | "unexpected-error";

export type SavedAiRecipeCookResult =
  | { status: "success" }
  | { status: "error"; code: SavedAiRecipeCookErrorCode };

export type SavedAiRecipeCookRequest = {
  recipe_id: string;
  meal_type: MealType;
};

export type SavedAiRecipeCookPlan = {
  mealName: string;
  mealType: MealType;
  lines: RecipeConsumptionLine[];
};

export type SavedAiRecipeInventoryItem = RecipeAiNutritionInventoryItem;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && Object.keys(record).every((key) => keys.includes(key));
}

export function parseCookSavedAiRecipeInput(input: unknown): SavedAiRecipeCookRequest | null {
  if (!isPlainObject(input) || !hasExactKeys(input, TOP_LEVEL_KEYS)) return null;
  if (typeof input.recipe_id !== "string" || !UUID_PATTERN.test(input.recipe_id)) return null;
  if (!isMealType(input.meal_type)) return null;
  return { recipe_id: input.recipe_id, meal_type: input.meal_type };
}

function toRecipeAiSuggestion(recipe: SavedAiRecipe): RecipeAiSuggestion | null {
  if (!recipe.ingredients.length) return null;
  return {
    title: recipe.title,
    description: recipe.description,
    estimated_minutes: recipe.estimated_minutes,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map((ingredient) => ({
      inventory_item_id: ingredient.inventory_item_id,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
    steps: [...recipe.steps],
  };
}

export function validateSavedAiRecipeCookInventory(
  recipe: SavedAiRecipe,
  inventoryItems: readonly SavedAiRecipeInventoryItem[],
  todayKey: string,
): SavedAiRecipeCookErrorCode | null {
  if (!recipe.ingredients.length) return "recipe-corrupt";
  if (recipe.ingredients.length > RECIPE_MAX_INGREDIENTS) return "too-many-items";
  const recipeItemIds = recipe.ingredients.map((ingredient) => ingredient.inventory_item_id);
  if (new Set(recipeItemIds).size !== recipeItemIds.length) return "recipe-corrupt";
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  if (inventoryById.size !== inventoryItems.length) return "recipe-stale";
  if (inventoryById.size !== recipe.ingredients.length) return "recipe-stale";

  for (const ingredient of recipe.ingredients) {
    const item = inventoryById.get(ingredient.inventory_item_id);
    if (!item) return "recipe-stale";
    if (item.expires_at && getInventoryExpirationDayDifference(item.expires_at, todayKey) < 0) return "expired-item";
    if (ingredient.name !== item.name || ingredient.unit !== item.unit) return "recipe-stale";
    if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) return "recipe-corrupt";
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || ingredient.quantity > item.quantity) return "insufficient-stock";
  }

  return null;
}

export function buildSavedAiRecipeCookPlan(
  recipe: SavedAiRecipe,
  inventoryItems: readonly SavedAiRecipeInventoryItem[],
  mealType: MealType,
): { ok: true; plan: SavedAiRecipeCookPlan } | { ok: false; code: SavedAiRecipeCookErrorCode } {
  const recipeSuggestion = toRecipeAiSuggestion(recipe);
  if (!recipeSuggestion) return { ok: false, code: "recipe-corrupt" };
  if (recipe.ingredients.length > RECIPE_MAX_INGREDIENTS) return { ok: false, code: "too-many-items" };

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const { allocations, missingItemIds } = buildRecipeAiNutritionAllocations(recipeSuggestion, inventoryById);
  if (missingItemIds.size > 0 || allocations.length !== recipe.ingredients.length) return { ok: false, code: "incompatible-unit" };

  const nutrition = estimateRecipeNutrition(allocations, recipe.servings);
  if (!nutrition.isComplete || !nutrition.total || !nutrition.perServing) return { ok: false, code: "nutrition-unavailable" };

  const consumptionLines = buildRecipeConsumptionLines(allocations, [...inventoryItems]);
  if (!consumptionLines.ok) {
    if (consumptionLines.code === "incompatible-unit") return { ok: false, code: "incompatible-unit" };
    if (consumptionLines.code === "missing-item") return { ok: false, code: "recipe-stale" };
    if (consumptionLines.code === "invalid-quantity" || consumptionLines.code === "empty") return { ok: false, code: "recipe-corrupt" };
    if (consumptionLines.code === "too-many-items") return { ok: false, code: "too-many-items" };
    return { ok: false, code: "unexpected-error" };
  }

  return { ok: true, plan: { mealName: `${recipe.title} (${recipe.servings} ración${recipe.servings === 1 ? "" : "es"})`, mealType, lines: consumptionLines.lines } };
}

export function mapSavedAiRecipeCookRpcError(error: { message?: string } | null | undefined): SavedAiRecipeCookErrorCode {
  if (error?.message === "Inventory item not found") return "recipe-stale";
  if (error?.message === "Quantity exceeds available stock") return "insufficient-stock";
  if (error?.message === "Incomplete inventory nutrition") return "nutrition-unavailable";
  if (error?.message === "Incompatible inventory nutrition unit") return "incompatible-unit";
  return "consumption-conflict";
}
