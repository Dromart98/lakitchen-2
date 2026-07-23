import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";
import { isMealType, type MealType } from "@/modules/meals/meal-types";
import type { RecipeConsumptionResult } from "@/modules/recipes/recipe-consumption";
import type { RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";
import { RECIPE_MAX_INGREDIENTS } from "@/modules/recipes/recipe-limits";

export type RecipeAiCookErrorCode =
  | "unauthenticated"
  | "invalid-input"
  | "recipe-stale"
  | "expired-item"
  | "insufficient-stock"
  | "incomplete-nutrition"
  | "incompatible-unit"
  | "too-many-items"
  | "calorie-budget-exceeded"
  | "consume-failed"
  | "unexpected-error";

export type RecipeAiCookResult =
  | { status: "success" }
  | { status: "error"; code: RecipeAiCookErrorCode };

export type RecipeAiCookRequest = {
  meal_type: MealType;
  recipe: RecipeAiSuggestion;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOP_LEVEL_KEYS = ["meal_type", "recipe"];
const RECIPE_KEYS = ["title", "description", "estimated_minutes", "servings", "ingredients", "steps"];
const INGREDIENT_KEYS = ["inventory_item_id", "name", "quantity", "unit"];

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).length === keys.length && Object.keys(record).every((key) => keys.includes(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function parseRecipeAiCookRequest(input: unknown): RecipeAiCookRequest | null {
  if (!isPlainObject(input) || !hasExactKeys(input, TOP_LEVEL_KEYS)) return null;
  if (!isMealType(input.meal_type) || !isPlainObject(input.recipe) || !hasExactKeys(input.recipe, RECIPE_KEYS)) return null;

  const recipe = input.recipe;
  if (!isNonEmptyString(recipe.title, 90) || !isNonEmptyString(recipe.description, 240)) return null;
  if (typeof recipe.estimated_minutes !== "number" || !Number.isInteger(recipe.estimated_minutes) || recipe.estimated_minutes < 1 || recipe.estimated_minutes > 60) return null;
  if (typeof recipe.servings !== "number" || !Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 4) return null;
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > RECIPE_MAX_INGREDIENTS) return null;
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 2 || recipe.steps.length > 12) return null;
  if (!recipe.steps.every((step) => isNonEmptyString(step, 280))) return null;

  const seenIds = new Set<string>();
  const ingredients = [];
  for (const ingredient of recipe.ingredients) {
    if (!isPlainObject(ingredient) || !hasExactKeys(ingredient, INGREDIENT_KEYS)) return null;
    if (!isNonEmptyString(ingredient.inventory_item_id, 100) || !UUID_PATTERN.test(ingredient.inventory_item_id)) return null;
    if (seenIds.has(ingredient.inventory_item_id)) return null;
    seenIds.add(ingredient.inventory_item_id);
    if (!isNonEmptyString(ingredient.name, 120) || !isNonEmptyString(ingredient.unit, 16)) return null;
    if (typeof ingredient.quantity !== "number" || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) return null;
    ingredients.push({
      inventory_item_id: ingredient.inventory_item_id,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    });
  }

  return {
    meal_type: input.meal_type,
    recipe: {
      title: recipe.title.trim(),
      description: recipe.description.trim(),
      estimated_minutes: recipe.estimated_minutes,
      servings: recipe.servings,
      ingredients,
      steps: recipe.steps.map((step) => step.trim()),
    },
  };
}

export type RecipeAiCookInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expires_at: string | null;
  nutrition_basis?: "per_100g" | "per_100ml" | "per_unit" | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export function validateRecipeAiCookInventory(
  recipe: RecipeAiSuggestion,
  inventoryItems: readonly RecipeAiCookInventoryItem[],
  todayKey: string,
): RecipeAiCookErrorCode | null {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  if (inventoryById.size !== recipe.ingredients.length) return "recipe-stale";

  for (const ingredient of recipe.ingredients) {
    const item = inventoryById.get(ingredient.inventory_item_id);
    if (!item) return "recipe-stale";
    if (item.expires_at && getInventoryExpirationDayDifference(item.expires_at, todayKey) < 0) return "expired-item";
    if (ingredient.name !== item.name || ingredient.unit !== item.unit) return "recipe-stale";
    if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) return "invalid-input";
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || ingredient.quantity > item.quantity) return "insufficient-stock";
  }

  return null;
}

export function mapRecipeConsumptionError(result: Extract<RecipeConsumptionResult, { ok: false }>): RecipeAiCookErrorCode {
  if (result.code === "empty" || result.code === "invalid-quantity") return "invalid-input";
  if (result.code === "missing-item") return "recipe-stale";
  if (result.code === "incompatible-unit") return "incompatible-unit";
  if (result.code === "too-many-items") return "too-many-items";
  return "unexpected-error";
}

export function mapRecipeAiCookRpcError(error: { message?: string } | null | undefined): RecipeAiCookErrorCode {
  if (error?.message === "Inventory item not found") return "recipe-stale";
  if (error?.message === "Quantity exceeds available stock") return "insufficient-stock";
  if (error?.message === "Incomplete inventory nutrition") return "incomplete-nutrition";
  if (error?.message === "Incompatible inventory nutrition unit") return "incompatible-unit";
  return "consume-failed";
}
