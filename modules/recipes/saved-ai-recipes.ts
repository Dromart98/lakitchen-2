import { createHash } from "node:crypto";

import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";
import { RECIPE_AI_PRIORITY_MODES, type RecipeAiPriorityMode, type RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOP_LEVEL_KEYS = ["priority_mode", "recipe"];
const RECIPE_KEYS = ["title", "description", "estimated_minutes", "servings", "ingredients", "steps"];
const INGREDIENT_KEYS = ["inventory_item_id", "name", "quantity", "unit"];
const MAX_INGREDIENTS = 20;

export type SaveGeneratedRecipeInput = {
  priority_mode: RecipeAiPriorityMode;
  recipe: RecipeAiSuggestion;
};

export type SaveGeneratedRecipeResult =
  | { status: "success"; code: "saved" | "already-saved"; recipeId: string }
  | { status: "error"; code: "unauthenticated" | "invalid-input" | "recipe-stale" | "insufficient-stock" | "expired-item" | "save-failed" | "unexpected-error" };

export type SavedAiRecipeInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expires_at: string | null;
};

export type SavedAiRecipeIngredient = {
  id: string;
  recipe_id: string;
  user_id: string;
  inventory_item_id: string;
  name: string;
  quantity: number;
  unit: string;
  sort_order: number;
  created_at: string;
};

export type SavedAiRecipe = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  servings: number;
  steps: string[];
  source_priority_mode: RecipeAiPriorityMode;
  fingerprint: string;
  created_at: string;
  ingredients: SavedAiRecipeIngredient[];
};

export type SavedAiRecipeRow = Omit<SavedAiRecipe, "ingredients"> & {
  user_saved_ai_recipe_ingredients: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && Object.keys(record).every((key) => keys.includes(key));
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && normalizeText(value).length > 0 && normalizeText(value).length <= maxLength;
}

function isValidPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parseSaveGeneratedRecipeInput(input: unknown): SaveGeneratedRecipeInput | null {
  if (!isPlainObject(input) || !hasExactKeys(input, TOP_LEVEL_KEYS)) return null;
  if (!RECIPE_AI_PRIORITY_MODES.includes(input.priority_mode as RecipeAiPriorityMode)) return null;
  if (!isPlainObject(input.recipe) || !hasExactKeys(input.recipe, RECIPE_KEYS)) return null;

  const recipe = input.recipe;
  if (!isNonEmptyString(recipe.title, 90) || !isNonEmptyString(recipe.description, 240)) return null;
  if (typeof recipe.estimated_minutes !== "number" || !Number.isInteger(recipe.estimated_minutes) || recipe.estimated_minutes < 1 || recipe.estimated_minutes > 60) return null;
  if (typeof recipe.servings !== "number" || !Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 4) return null;
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > MAX_INGREDIENTS) return null;
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
    if (!isValidPositiveNumber(ingredient.quantity)) return null;
    ingredients.push({
      inventory_item_id: ingredient.inventory_item_id,
      name: normalizeText(ingredient.name),
      quantity: ingredient.quantity,
      unit: normalizeText(ingredient.unit),
    });
  }

  return {
    priority_mode: input.priority_mode as RecipeAiPriorityMode,
    recipe: {
      title: normalizeText(recipe.title),
      description: normalizeText(recipe.description),
      estimated_minutes: recipe.estimated_minutes,
      servings: recipe.servings,
      ingredients,
      steps: recipe.steps.map(normalizeText),
    },
  };
}

export function buildCanonicalSavedAiRecipe(recipe: RecipeAiSuggestion): string {
  return JSON.stringify({
    title: normalizeText(recipe.title),
    description: normalizeText(recipe.description),
    estimated_minutes: recipe.estimated_minutes,
    servings: recipe.servings,
    ingredients: [...recipe.ingredients]
      .sort((first, second) => first.inventory_item_id.localeCompare(second.inventory_item_id))
      .map((ingredient) => ({
        inventory_item_id: ingredient.inventory_item_id,
        name: normalizeText(ingredient.name),
        quantity: ingredient.quantity,
        unit: normalizeText(ingredient.unit),
      })),
    steps: recipe.steps.map(normalizeText),
  });
}

export function createSavedAiRecipeFingerprint(recipe: RecipeAiSuggestion): string {
  return createHash("sha256").update(buildCanonicalSavedAiRecipe(recipe)).digest("hex");
}

export function validateSavedAiRecipeInventory(recipe: RecipeAiSuggestion, inventoryItems: readonly SavedAiRecipeInventoryItem[], todayKey: string): Extract<SaveGeneratedRecipeResult, { status: "error" }>["code"] | null {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  if (inventoryById.size !== recipe.ingredients.length) return "recipe-stale";

  for (const ingredient of recipe.ingredients) {
    const item = inventoryById.get(ingredient.inventory_item_id);
    if (!item) return "recipe-stale";
    if (item.expires_at && getInventoryExpirationDayDifference(item.expires_at, todayKey) < 0) return "expired-item";
    if (ingredient.name !== item.name || ingredient.unit !== item.unit) return "recipe-stale";
    if (!isValidPositiveNumber(ingredient.quantity)) return "invalid-input";
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || ingredient.quantity > item.quantity) return "insufficient-stock";
  }

  return null;
}

export function toSavedAiRecipe(row: unknown): SavedAiRecipe | null {
  if (!isPlainObject(row)) return null;
  if (!UUID_PATTERN.test(String(row.id ?? "")) || !UUID_PATTERN.test(String(row.user_id ?? ""))) return null;
  if (!isNonEmptyString(row.title, 90) || !isNonEmptyString(row.description, 240)) return null;
  if (typeof row.estimated_minutes !== "number" || !Number.isInteger(row.estimated_minutes) || row.estimated_minutes < 1 || row.estimated_minutes > 60) return null;
  if (typeof row.servings !== "number" || !Number.isInteger(row.servings) || row.servings < 1 || row.servings > 4) return null;
  if (!Array.isArray(row.steps) || row.steps.length < 1 || !row.steps.every((step) => typeof step === "string" && step.trim().length > 0)) return null;
  if (!RECIPE_AI_PRIORITY_MODES.includes(row.source_priority_mode as RecipeAiPriorityMode)) return null;
  if (!isNonEmptyString(row.fingerprint, 128) || typeof row.created_at !== "string") return null;
  if (!Array.isArray(row.user_saved_ai_recipe_ingredients)) return null;

  const ingredients = row.user_saved_ai_recipe_ingredients.map((ingredient) => {
    if (!isPlainObject(ingredient)) return null;
    if (!UUID_PATTERN.test(String(ingredient.id ?? "")) || !UUID_PATTERN.test(String(ingredient.recipe_id ?? "")) || !UUID_PATTERN.test(String(ingredient.user_id ?? "")) || !UUID_PATTERN.test(String(ingredient.inventory_item_id ?? ""))) return null;
    if (!isNonEmptyString(ingredient.name, 120) || !isNonEmptyString(ingredient.unit, 16) || !isValidPositiveNumber(ingredient.quantity)) return null;
    if (typeof ingredient.sort_order !== "number" || !Number.isInteger(ingredient.sort_order) || ingredient.sort_order < 0 || ingredient.sort_order > 19) return null;
    if (typeof ingredient.created_at !== "string") return null;
    return ingredient as SavedAiRecipeIngredient;
  });

  if (ingredients.some((ingredient) => ingredient === null)) return null;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: normalizeText(String(row.title)),
    description: normalizeText(String(row.description)),
    estimated_minutes: row.estimated_minutes,
    servings: row.servings,
    steps: row.steps.map(normalizeText),
    source_priority_mode: row.source_priority_mode as RecipeAiPriorityMode,
    fingerprint: String(row.fingerprint),
    created_at: row.created_at,
    ingredients: (ingredients as SavedAiRecipeIngredient[]).slice().sort((first, second) => first.sort_order - second.sort_order),
  };
}
