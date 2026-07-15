"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { generateRecipesWithOpenAi } from "@/lib/openai/recipe-generation";
import { buildRecipeAiNutritionAllocations, enrichRecipeAiSuggestionsWithNutrition } from "@/modules/recipes/recipe-ai-nutrition";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import { isMealType } from "@/modules/meals/meal-types";
import { buildRecipeConsumptionLines } from "@/modules/recipes/recipe-consumption";
import {
  filterUsableRecipeAiInventoryItems,
  parseRecipeAiRequest,
  RECIPE_AI_MAX_INVENTORY_ITEMS,
  RECIPE_AI_MIN_INVENTORY_ITEMS,
  type RecipeAiActionResult,
  type RecipeAiInventoryItem,
} from "@/modules/recipes/recipe-ai-generation";
import { getUrgentRecipeAiInventoryItemIds, sortRecipeAiSuggestionsByUrgency } from "@/modules/recipes/recipe-ai-urgency";
import {
  mapRecipeAiCookRpcError,
  mapRecipeConsumptionError,
  parseRecipeAiCookRequest,
  validateRecipeAiCookInventory,
  type RecipeAiCookInventoryItem,
  type RecipeAiCookResult,
} from "@/modules/recipes/recipe-ai-consumption";
import {
  matchRecipesToInventory,
  normalizeRecipeFilterMode,
  type RecipeIngredient,
  type RecipeInventoryItem,
  type RecipeTemplate,
} from "@/modules/recipes/recipe-matching";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";
import { buildRecipeMealName, scaleRecipeToServings } from "@/modules/recipes/recipe-servings";

const RECIPES_PATH = "/recipes";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecipeTemplateConsumptionRow = Omit<RecipeTemplate, "instructions" | "recipe_ingredients"> & {
  recipe_ingredients: RecipeIngredient[] | null;
};

type SupabaseQueryBuilder = {
  select(columns: string): SupabaseQueryBuilder;
  eq(column: string, value: string): SupabaseQueryBuilder;
  gt(column: string, value: number): Promise<unknown>;
  maybeSingle(): Promise<unknown>;
};

type SupabaseRecipeClient = {
  from(table: string): SupabaseQueryBuilder;
  rpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown>;
};

function buildRecipesPath(mode: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams({ mode, ...params });
  return `${RECIPES_PATH}?${searchParams.toString()}`;
}

function redirectWithRecipeError(mode: string, error: string): never {
  redirect(buildRecipesPath(mode, { recipeError: error }));
}

function redirectWithRecipeSuccess(mode: string): never {
  redirect(buildRecipesPath(mode, { recipeSuccess: "recipe-cooked" }));
}

function getSafeRecipeRpcError(error: { code?: string; message: string }): string {
  if (error.message === "Inventory item not found") return "recipe-not-cookable";
  if (error.message === "Quantity exceeds available stock") return "insufficient-stock";
  if (error.message === "Incomplete inventory nutrition") return "incomplete-nutrition";
  if (error.message === "Incompatible inventory nutrition unit") return "incompatible-nutrition-unit";

  return "consume-failed";
}

function toRecipeTemplate(row: RecipeTemplateConsumptionRow): RecipeTemplate {
  return {
    ...row,
    instructions: [],
    recipe_ingredients: [...(row.recipe_ingredients ?? [])].sort((first, second) => first.sort_order - second.sort_order),
  };
}

export async function cookRecipeAndLogMealAction(formData: FormData) {
  const mode = normalizeRecipeFilterMode(String(formData.get("mode") ?? ""));
  const recipeId = String(formData.get("recipe_id") ?? "").trim();
  const mealType = String(formData.get("meal_type") ?? "").trim();
  const servingsValue = String(formData.get("servings") ?? "").trim();

  if (!UUID_PATTERN.test(recipeId)) redirectWithRecipeError(mode, "recipe-not-found");
  if (!isMealType(mealType)) redirectWithRecipeError(mode, "consume-failed");
  if (!/^[1-9]\d*$/.test(servingsValue)) redirectWithRecipeError(mode, "invalid-servings");

  const requestedServings = Number(servingsValue);
  if (!Number.isSafeInteger(requestedServings)) redirectWithRecipeError(mode, "invalid-servings");

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "recipe consumption");
  const recipeClient = supabase as unknown as SupabaseRecipeClient;

  const { data: inventoryData, error: inventoryError } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .gt("quantity", 0) as { data: RecipeInventoryItem[] | null; error: { message: string } | null };

  if (inventoryError) {
    console.warn("Supabase could not load recipe consumption inventory items:", inventoryError.message);
    redirectWithRecipeError(mode, "consume-failed");
  }

  const { data: recipeData, error: recipeError } = await recipeClient
    .from("recipe_templates")
    .select("id, slug, title, description, prep_minutes, servings, recipe_ingredients(id, recipe_id, display_name, match_terms, required_quantity, required_unit, is_required, sort_order)")
    .eq("id", recipeId)
    .maybeSingle() as { data: RecipeTemplateConsumptionRow | null; error: { message: string } | null };

  if (recipeError) {
    console.warn("Supabase could not load recipe for consumption:", recipeError.message);
    redirectWithRecipeError(mode, "consume-failed");
  }

  if (!recipeData) redirectWithRecipeError(mode, "recipe-not-found");

  const inventoryItems = inventoryData ?? [];
  const recipe = toRecipeTemplate(recipeData);
  const scaledRecipe = scaleRecipeToServings(recipe, requestedServings);
  if (!scaledRecipe.ok) redirectWithRecipeError(mode, "invalid-servings");

  const [match] = matchRecipesToInventory([scaledRecipe.recipe], inventoryItems, getCurrentInventoryExpirationDateKey());

  if (!match?.canCookNow) redirectWithRecipeError(mode, "recipe-not-cookable");

  const allocations = match.ingredientMatches.flatMap((ingredientMatch) => ingredientMatch.allocations);
  if (allocations.length === 0) redirectWithRecipeError(mode, "recipe-not-cookable");

  const nutrition = estimateRecipeNutrition(allocations, match.recipe.servings);
  if (!nutrition.isComplete || !nutrition.total || !nutrition.perServing) {
    redirectWithRecipeError(mode, "incomplete-nutrition");
  }

  const consumptionLines = buildRecipeConsumptionLines(allocations, inventoryItems);
  if (!consumptionLines.ok) {
    const errorCode = consumptionLines.code === "incompatible-unit" ? "incompatible-nutrition-unit" : "recipe-not-cookable";
    redirectWithRecipeError(mode, errorCode);
  }

  const { error: consumeError } = await recipeClient.rpc("consume_meal_builder_items_and_log_meal", {
    p_meal_name: buildRecipeMealName(match.recipe.title, requestedServings),
    p_meal_type: mealType,
    p_lines: consumptionLines.lines,
  }) as { data: string | null; error: { code?: string; message: string } | null };

  if (consumeError) {
    console.warn("Supabase could not consume recipe items and log a meal:", consumeError.message);
    redirectWithRecipeError(mode, getSafeRecipeRpcError(consumeError));
  }

  revalidatePath(RECIPES_PATH);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");

  redirectWithRecipeSuccess(mode);
}


type RecipeAiSupabaseQueryBuilder = {
  select(columns: string): RecipeAiSupabaseQueryBuilder;
  eq(column: string, value: string): RecipeAiSupabaseQueryBuilder;
  gt(column: string, value: number): RecipeAiSupabaseQueryBuilder;
  in(column: string, values: string[]): Promise<unknown>;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): RecipeAiSupabaseQueryBuilder;
  limit(count: number): Promise<unknown>;
};

type RecipeAiSupabaseClient = {
  from(table: string): RecipeAiSupabaseQueryBuilder;
};

export async function generateRecipeAiSuggestionsAction(input: unknown): Promise<RecipeAiActionResult> {
  const request = parseRecipeAiRequest(input);
  if (!request) return { status: "error", code: "invalid-input" };

  const supabase = await createClient();
  let user: { id: string };

  try {
    user = await requireAuthenticatedUser(supabase, "AI recipe generation");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const recipeClient = supabase as unknown as RecipeAiSupabaseClient;
  const { data, error } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, category, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .gt("quantity", 0)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(RECIPE_AI_MAX_INVENTORY_ITEMS) as { data: RecipeAiInventoryItem[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load AI recipe inventory items:", error.message);
    return { status: "error", code: "unexpected-error" };
  }

  const todayKey = getCurrentInventoryExpirationDateKey();
  const inventoryItems = filterUsableRecipeAiInventoryItems(data ?? [], todayKey);
  if (inventoryItems.length === 0) return { status: "error", code: "empty-inventory" };
  if (inventoryItems.length < RECIPE_AI_MIN_INVENTORY_ITEMS) return { status: "error", code: "insufficient-inventory" };

  const urgentInventoryItemIds = request.priority_mode === "expiration"
    ? getUrgentRecipeAiInventoryItemIds(inventoryItems, todayKey)
    : new Set<string>();

  if (request.priority_mode === "expiration" && urgentInventoryItemIds.size === 0) {
    return { status: "needs-clarification", message: "No tienes productos que caduquen en los próximos 7 días." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "error", code: "missing-api-key" };

  try {
    const result = await generateRecipesWithOpenAi(request, inventoryItems, {
      apiKey,
      model: process.env.OPENAI_RECIPE_MODEL,
      urgentInventoryItemIds,
    });

    if (result.status !== "success") return result;

    const recipes = request.priority_mode === "expiration"
      ? sortRecipeAiSuggestionsByUrgency(result.recipes, inventoryItems, todayKey)
      : result.recipes;

    return {
      status: "success",
      recipes: enrichRecipeAiSuggestionsWithNutrition(recipes, inventoryItems),
    };
  } catch {
    return { status: "error", code: "unexpected-error" };
  }
}


type RecipeAiCookSupabaseQueryBuilder = {
  select(columns: string): RecipeAiCookSupabaseQueryBuilder;
  eq(column: string, value: string): RecipeAiCookSupabaseQueryBuilder;
  in(column: string, values: string[]): RecipeAiCookSupabaseQueryBuilder;
  gt(column: string, value: number): Promise<unknown>;
};

type RecipeAiCookSupabaseClient = {
  from(table: string): RecipeAiCookSupabaseQueryBuilder;
  rpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown>;
};

export async function cookGeneratedRecipeAndLogMealAction(input: unknown): Promise<RecipeAiCookResult> {
  const request = parseRecipeAiCookRequest(input);
  if (!request) return { status: "error", code: "invalid-input" };

  const supabase = await createClient();
  let user: { id: string };

  try {
    user = await requireAuthenticatedUser(supabase, "AI recipe consumption");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const inventoryItemIds = request.recipe.ingredients.map((ingredient) => ingredient.inventory_item_id);
  const recipeClient = supabase as unknown as RecipeAiCookSupabaseClient;
  const { data, error } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .in("id", inventoryItemIds)
    .gt("quantity", 0) as { data: RecipeAiCookInventoryItem[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load AI recipe consumption inventory items:", error.message);
    return { status: "error", code: "unexpected-error" };
  }

  const inventoryItems = data ?? [];
  const validationError = validateRecipeAiCookInventory(request.recipe, inventoryItems, getCurrentInventoryExpirationDateKey());
  if (validationError) return { status: "error", code: validationError };

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const { allocations, missingItemIds } = buildRecipeAiNutritionAllocations(request.recipe, inventoryById);
  if (missingItemIds.size > 0 || allocations.length !== request.recipe.ingredients.length) {
    return { status: "error", code: "recipe-stale" };
  }

  const nutrition = estimateRecipeNutrition(allocations, request.recipe.servings);
  if (!nutrition.isComplete || !nutrition.total || !nutrition.perServing) {
    return { status: "error", code: "incomplete-nutrition" };
  }

  const consumptionLines = buildRecipeConsumptionLines(allocations, inventoryItems);
  if (!consumptionLines.ok) return { status: "error", code: mapRecipeConsumptionError(consumptionLines) };

  const { error: consumeError } = await recipeClient.rpc("consume_meal_builder_items_and_log_meal", {
    p_meal_name: buildRecipeMealName(request.recipe.title, request.recipe.servings),
    p_meal_type: request.meal_type,
    p_lines: consumptionLines.lines,
  }) as { data: string | null; error: { code?: string; message: string } | null };

  if (consumeError) {
    console.warn("Supabase could not consume AI recipe items and log a meal:", consumeError.message);
    return { status: "error", code: mapRecipeAiCookRpcError(consumeError) };
  }

  revalidatePath(RECIPES_PATH);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");

  return { status: "success" };
}
