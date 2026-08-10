"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { generateRecipesWithOpenAi } from "@/lib/openai/recipe-generation";
import { classifyAiResult, createAiUsageMeter } from "@/lib/ai/metering";
import { buildRecipeAiNutritionAllocations } from "@/modules/recipes/recipe-ai-nutrition";
import { loadAndAttachRecipeAiUnitMeasures, type RecipeAiUnitMeasureClient } from "@/modules/recipes/recipe-ai-unit-measures.server";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import { selectInventoryUnitMeasures } from "@/modules/inventory/inventory-unit-equivalence";
import { isMealType } from "@/modules/meals/meal-types";
import { buildRecipeConsumptionLines } from "@/modules/recipes/recipe-consumption";
import {
  filterUsableRecipeAiInventoryItems,
  parseRecipeAiRequest,
  RECIPE_AI_MAX_INVENTORY_ITEMS,
  RECIPE_AI_MIN_INVENTORY_ITEMS,
  RECIPE_AI_MODEL_DEFAULT,
  type RecipeAiActionResult,
  type RecipeAiInventoryItem,
} from "@/modules/recipes/recipe-ai-generation";
import { getUrgentRecipeAiInventoryItemIds, sortRecipeAiSuggestionsByUrgency } from "@/modules/recipes/recipe-ai-urgency";
import {
  createSavedAiRecipeFingerprint,
  parseSaveGeneratedRecipeInput,
  validateSavedAiRecipeInventory,
  type SaveGeneratedRecipeResult,
  toSavedAiRecipe,
  type SavedAiRecipeInventoryItem,
  type SavedAiRecipeRow,
} from "@/modules/recipes/saved-ai-recipes";
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
  attachRecipeInventoryUnitMeasures,
  normalizeRecipeFilterMode,
  type RecipeIngredient,
  type RecipeInventoryItem,
  type RecipeInventoryItemRow,
  type RecipeTemplate,
} from "@/modules/recipes/recipe-matching";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";
import {
  buildSavedAiRecipeCookPlan,
  mapSavedAiRecipeCookRpcError,
  parseCookSavedAiRecipeInput,
  validateSavedAiRecipeCookInventory,
  type SavedAiRecipeCookResult,
  type SavedAiRecipeInventoryItem as SavedAiRecipeCookInventoryItem,
} from "@/modules/recipes/saved-ai-recipe-consumption";
import { buildRecipeMealName, scaleRecipeToServings } from "@/modules/recipes/recipe-servings";
import { buildRecipeCalorieBudget, isRecipeServingWithinCalorieBudget, validateAndAdjustAiRecipeCalories, type RecipeCalorieBudget } from "@/modules/recipes/recipe-calorie-budget";
import { getTodayUtcDate } from "@/modules/meals/meal-date";
import { parseSavedRecipeCookingYieldMeasurement } from "@/modules/recipes/saved-ai-recipe-cooking-yield-measurement";
import {
  buildSavedAiRecipeCookedBatchRpcPayload,
  mapCreateSavedAiRecipeCookedBatchRpcError,
  parseCreateSavedAiRecipeCookedBatchInput,
  type CreateSavedAiRecipeCookedBatchErrorCode,
  type CreateSavedAiRecipeCookedBatchResult,
} from "@/modules/recipes/saved-ai-recipe-batch-creation";
import {
  buildConsumeCookedBatchRpcPayload,
  mapConsumeCookedBatchRpcError,
  parseConsumeCookedBatchInput,
  type ConsumeCookedBatchResult,
} from "@/modules/recipes/cooked-batch-consumption";

const RECIPES_PATH = "/recipes";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecipeTemplateConsumptionRow = Omit<RecipeTemplate, "instructions" | "recipe_ingredients"> & {
  recipe_ingredients: RecipeIngredient[] | null;
};

type SupabaseQueryBuilder = {
  select(columns: string): SupabaseQueryBuilder;
  eq(column: string, value: string | boolean): SupabaseQueryBuilder;
  gt(column: string, value: number): Promise<unknown>;
  maybeSingle(): Promise<unknown>;
  in(column: string, values: string[]): Promise<unknown>;
};

type SupabaseRecipeClient = {
  from(table: string): SupabaseQueryBuilder;
  rpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown>;
};

type RecipeBudgetQuery = {
  select(columns: string): RecipeBudgetQuery;
  eq(column: string, value: string): RecipeBudgetQuery;
  maybeSingle(): Promise<unknown>;
};

type RecipeBudgetClient = { from(table: string): RecipeBudgetQuery };

async function loadRecipeCalorieBudget(client: RecipeBudgetClient, userId: string): Promise<RecipeCalorieBudget | null> {
  const today = getTodayUtcDate();
  const [profileResult, mealsResult] = await Promise.all([
    client.from("user_nutrition_profiles").select("target_calories").eq("user_id", userId).maybeSingle() as Promise<{ data: { target_calories: number | null } | null; error: { message: string } | null }>,
    client.from("daily_meal_logs").select("calories").eq("user_id", userId).eq("consumed_on", today) as unknown as Promise<{ data: { calories: number | null }[] | null; error: { message: string } | null }>,
  ]);
  if (profileResult.error || mealsResult.error) return null;
  const consumedCalories = (mealsResult.data ?? []).reduce((sum, meal) => sum + (Number.isFinite(meal.calories) ? meal.calories ?? 0 : 0), 0);
  return buildRecipeCalorieBudget(profileResult.data?.target_calories ?? null, consumedCalories);
}

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
  if (error.message === "equivalence_conflict") return "equivalence-conflict";

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
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id, food_catalog_items!inventory_items_food_owner_fk(normalized_name, aliases)")
    .eq("user_id", user.id)
    .gt("quantity", 0) as { data: RecipeInventoryItemRow[] | null; error: { message: string } | null };

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

  const identityIds = [...new Set((inventoryData ?? []).map((row) => typeof row.food_catalog_item_id === "string" ? row.food_catalog_item_id : "").filter(Boolean))];
  let unitMeasures = new Map();
  if (identityIds.length > 0) {
    const { data, error } = await recipeClient
      .from("food_quantity_equivalences")
      .select("id, food_catalog_item_id, user_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed, updated_at")
      .eq("user_id", user.id)
      .eq("measure_kind", "unit")
      .eq("user_confirmed", true)
      .eq("source", "user")
      .in("food_catalog_item_id", identityIds) as { data: unknown[] | null; error: { message: string } | null };
    if (error) console.warn("Supabase could not load recipe consumption unit measures:", error.message);
    else unitMeasures = new Map(selectInventoryUnitMeasures(data ?? [], user.id, identityIds));
  }
  const inventoryItems: RecipeInventoryItem[] = attachRecipeInventoryUnitMeasures(inventoryData ?? [], unitMeasures);
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

  const budget = await loadRecipeCalorieBudget(recipeClient as unknown as RecipeBudgetClient, user.id);
  if (budget && !isRecipeServingWithinCalorieBudget(nutrition.perServing.calories, budget)) {
    redirectWithRecipeError(mode, "calorie-budget-exceeded");
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

  const model = process.env.OPENAI_RECIPE_MODEL ?? RECIPE_AI_MODEL_DEFAULT;
  const meter = createAiUsageMeter({ userId: user.id, feature: "recipe_generation", model });
  if (!meter.authorizeFeature()) {
    await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
    return { status: "error", code: "ai-feature-disabled" };
  }

  const recipeClient = supabase as unknown as RecipeAiSupabaseClient;
  const { data, error } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, category, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id")
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
  const usableInventoryItems = filterUsableRecipeAiInventoryItems(data ?? [], todayKey);
  const inventoryItems = await loadAndAttachRecipeAiUnitMeasures(recipeClient as unknown as RecipeAiUnitMeasureClient, user.id, usableInventoryItems, "AI recipe generation");
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
      model,
      fetchImpl: meter.fetchImpl,
      expirationContext: request.priority_mode === "expiration"
        ? { todayKey, urgentInventoryItemIds }
        : undefined,
    });
    await meter.finish(classifyAiResult(result));
    const accessError = meter.getAccessError();
    if (accessError) return { status: "error", code: accessError };

    if (result.status !== "success") return result;

    const recipes = request.priority_mode === "expiration"
      ? sortRecipeAiSuggestionsByUrgency(result.recipes, inventoryItems, todayKey)
      : result.recipes;

    const budget = await loadRecipeCalorieBudget(recipeClient as unknown as RecipeBudgetClient, user.id);
    const validatedRecipes = recipes
      .map((recipe) => validateAndAdjustAiRecipeCalories(recipe, inventoryItems, budget))
      .filter((recipe) => recipe.calorieValidation.status !== "not-viable");

    if (validatedRecipes.length === 0 && budget) {
      return { status: "needs-clarification", message: "Esta receta supera las calorías que te quedan hoy. Hemos ajustado la ración o puedes generar otra opción." };
    }

    return {
      status: "success",
      recipes: validatedRecipes,
    };
  } catch {
    return { status: "error", code: "unexpected-error" };
  }
}


type SaveGeneratedRecipeSupabaseQueryBuilder = {
  select(columns: string): SaveGeneratedRecipeSupabaseQueryBuilder;
  eq(column: string, value: string): SaveGeneratedRecipeSupabaseQueryBuilder;
  in(column: string, values: string[]): SaveGeneratedRecipeSupabaseQueryBuilder;
  gt(column: string, value: number): Promise<unknown>;
  maybeSingle(): Promise<unknown>;
  delete(): SaveGeneratedRecipeSupabaseQueryBuilder;
};

type SaveGeneratedRecipeSupabaseClient = {
  from(table: string): SaveGeneratedRecipeSupabaseQueryBuilder;
  rpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown>;
};

export async function saveGeneratedRecipeAction(input: unknown): Promise<SaveGeneratedRecipeResult> {
  const request = parseSaveGeneratedRecipeInput(input);
  if (!request) return { status: "error", code: "invalid-input" };

  const supabase = await createClient();
  let user: { id: string };

  try {
    user = await requireAuthenticatedUser(supabase, "AI recipe saving");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const inventoryItemIds = request.recipe.ingredients.map((ingredient) => ingredient.inventory_item_id);
  if (new Set(inventoryItemIds).size !== inventoryItemIds.length) return { status: "error", code: "invalid-input" };

  const recipeClient = supabase as unknown as SaveGeneratedRecipeSupabaseClient;
  const { data, error } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id")
    .eq("user_id", user.id)
    .in("id", inventoryItemIds)
    .gt("quantity", 0) as { data: SavedAiRecipeInventoryItem[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load AI recipe saving inventory items:", error.message);
    return { status: "error", code: "unexpected-error" };
  }

  const inventoryItems = await loadAndAttachRecipeAiUnitMeasures(recipeClient as unknown as RecipeAiUnitMeasureClient, user.id, data ?? [], "AI recipe saving");
  const validationError = validateSavedAiRecipeInventory(request.recipe, inventoryItems, getCurrentInventoryExpirationDateKey());
  if (validationError) return { status: "error", code: validationError };

  const budget = await loadRecipeCalorieBudget(recipeClient as unknown as RecipeBudgetClient, user.id);
  const nutritionInventory = inventoryItems;
  const nutrition = validateAndAdjustAiRecipeCalories(request.recipe, nutritionInventory, budget);
  if (budget && nutrition.nutrition.isComplete && nutrition.calorieValidation.status === "not-viable") return { status: "error", code: "calorie-budget-exceeded" };

  const fingerprint = createSavedAiRecipeFingerprint(request.recipe);

  const { data: existingData, error: existingError } = await recipeClient
    .from("user_saved_ai_recipes")
    .select("id")
    .eq("user_id", user.id)
    .eq("fingerprint", fingerprint)
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null };

  if (existingError) {
    console.warn("Supabase could not check saved AI recipe duplicate:", existingError.message);
    return { status: "error", code: "save-failed" };
  }

  if (existingData?.id) return { status: "success", code: "already-saved", recipeId: existingData.id };

  const { data: recipeId, error: saveError } = await recipeClient.rpc("save_user_ai_recipe", {
    p_title: request.recipe.title,
    p_description: request.recipe.description,
    p_estimated_minutes: request.recipe.estimated_minutes,
    p_servings: request.recipe.servings,
    p_steps: request.recipe.steps,
    p_source_priority_mode: request.priority_mode,
    p_fingerprint: fingerprint,
    p_ingredients: request.recipe.ingredients,
  }) as { data: string | null; error: { message: string } | null };

  if (saveError || !recipeId) {
    console.warn("Supabase could not save AI recipe.");
    return { status: "error", code: "save-failed" };
  }

  revalidatePath(RECIPES_PATH);
  return { status: "success", code: "saved", recipeId };
}

export async function deleteSavedAiRecipeAction(formData: FormData) {
  const recipeId = String(formData.get("recipe_id") ?? "").trim();
  if (!UUID_PATTERN.test(recipeId)) return;

  const supabase = await createClient();
  let user: { id: string };

  try {
    user = await requireAuthenticatedUser(supabase, "saved AI recipe deletion");
  } catch {
    return;
  }

  const recipeClient = supabase as unknown as SaveGeneratedRecipeSupabaseClient;
  const deleteResult = await recipeClient
    .from("user_saved_ai_recipes")
    .delete()
    .eq("id", recipeId)
    .eq("user_id", user.id)
    .select("id") as unknown as { data: { id: string }[] | null; error: { message: string } | null };
  const { error } = deleteResult;

  if (error) {
    console.warn("Supabase could not delete saved AI recipe.");
    return;
  }

  revalidatePath(RECIPES_PATH);
}

export type SavedRecipeCookingYieldMutationResult =
  | { status: "success"; code: "saved" | "updated" | "deleted" }
  | { status: "error"; code: "invalid-input" | "unauthenticated" | "recipe-not-found" | "save-failed" | "delete-failed" };

type CookingYieldMutationQuery = PromiseLike<unknown> & {
  select(columns: string): CookingYieldMutationQuery;
  eq(column: string, value: string): CookingYieldMutationQuery;
  maybeSingle(): Promise<unknown>;
  insert(values: Record<string, unknown>): CookingYieldMutationQuery;
  update(values: Record<string, unknown>): CookingYieldMutationQuery;
  delete(): CookingYieldMutationQuery;
};
type CookingYieldMutationClient = { from(table: string): CookingYieldMutationQuery };

export async function saveSavedRecipeCookingYieldAction(input: unknown): Promise<SavedRecipeCookingYieldMutationResult> {
  const measurement = parseSavedRecipeCookingYieldMeasurement(input);
  if (!measurement) return { status: "error", code: "invalid-input" };
  const supabase = await createClient();
  let user: { id: string };
  try {
    user = await requireAuthenticatedUser(supabase, "saved recipe cooking yield saving");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const client = supabase as unknown as CookingYieldMutationClient;
  const { data: recipe, error: recipeError } = await client.from("user_saved_ai_recipes").select("id").eq("id", measurement.recipeId).eq("user_id", user.id).maybeSingle() as { data: { id: string } | null; error: unknown };
  if (recipeError) return { status: "error", code: "save-failed" };
  if (!recipe) return { status: "error", code: "recipe-not-found" };
  const { data: existing, error: existingError } = await client.from("user_saved_ai_recipe_cooking_yields").select("recipe_id").eq("recipe_id", measurement.recipeId).eq("user_id", user.id).maybeSingle() as { data: { recipe_id: string } | null; error: unknown };
  if (existingError) return { status: "error", code: "save-failed" };

  const values = { recipe_id: measurement.recipeId, user_id: user.id, raw_weight_g: measurement.rawWeightG, cooked_weight_g: measurement.cookedWeightG, servings: measurement.servings, updated_at: new Date().toISOString() };
  const mutation = (existing
    ? await client.from("user_saved_ai_recipe_cooking_yields").update(values).eq("recipe_id", measurement.recipeId).eq("user_id", user.id).select("recipe_id").maybeSingle()
    : await client.from("user_saved_ai_recipe_cooking_yields").insert(values).select("recipe_id").maybeSingle()) as { data: { recipe_id: string } | null; error: unknown };
  if (mutation.error || !mutation.data) return { status: "error", code: "save-failed" };
  revalidatePath(RECIPES_PATH);
  return { status: "success", code: existing ? "updated" : "saved" };
}

export async function deleteSavedRecipeCookingYieldAction(recipeId: string): Promise<SavedRecipeCookingYieldMutationResult> {
  if (!UUID_PATTERN.test(recipeId)) return { status: "error", code: "invalid-input" };
  const supabase = await createClient();
  let user: { id: string };
  try {
    user = await requireAuthenticatedUser(supabase, "saved recipe cooking yield deletion");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }
  const client = supabase as unknown as CookingYieldMutationClient;
  const { data: recipe, error: recipeError } = await client.from("user_saved_ai_recipes").select("id").eq("id", recipeId).eq("user_id", user.id).maybeSingle() as { data: { id: string } | null; error: unknown };
  if (recipeError) return { status: "error", code: "delete-failed" };
  if (!recipe) return { status: "error", code: "recipe-not-found" };
  const { error } = await client.from("user_saved_ai_recipe_cooking_yields").delete().eq("recipe_id", recipeId).eq("user_id", user.id) as { error: unknown };
  if (error) return { status: "error", code: "delete-failed" };
  revalidatePath(RECIPES_PATH);
  return { status: "success", code: "deleted" };
}


type CookSavedAiRecipeSupabaseQueryBuilder = {
  select(columns: string): CookSavedAiRecipeSupabaseQueryBuilder;
  eq(column: string, value: string): CookSavedAiRecipeSupabaseQueryBuilder;
  in(column: string, values: string[]): Promise<unknown>;
  maybeSingle(): Promise<unknown>;
};

type CookSavedAiRecipeSupabaseClient = {
  from(table: string): CookSavedAiRecipeSupabaseQueryBuilder;
  rpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown>;
};

export async function cookSavedAiRecipeAndLogMealAction(input: unknown): Promise<SavedAiRecipeCookResult> {
  const request = parseCookSavedAiRecipeInput(input);
  if (!request) return { status: "error", code: "invalid-input" };

  const supabase = await createClient();
  let user: { id: string };

  try {
    user = await requireAuthenticatedUser(supabase, "saved AI recipe consumption");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const recipeClient = supabase as unknown as CookSavedAiRecipeSupabaseClient;
  const { data: recipeData, error: recipeError } = await recipeClient
    .from("user_saved_ai_recipes")
    .select("id, user_id, title, description, estimated_minutes, servings, steps, source_priority_mode, fingerprint, created_at, user_saved_ai_recipe_ingredients(id, recipe_id, user_id, inventory_item_id, name, quantity, unit, sort_order, created_at)")
    .eq("id", request.recipe_id)
    .eq("user_id", user.id)
    .maybeSingle() as { data: SavedAiRecipeRow | null; error: { message: string } | null };

  if (recipeError) {
    console.warn("Supabase could not load saved AI recipe for consumption.");
    return { status: "error", code: "unexpected-error" };
  }

  if (!recipeData) return { status: "error", code: "recipe-not-found" };

  const recipe = toSavedAiRecipe(recipeData);
  if (!recipe || recipe.user_id !== user.id || recipe.id !== request.recipe_id) return { status: "error", code: "recipe-corrupt" };

  const inventoryItemIds = recipe.ingredients.map((ingredient) => ingredient.inventory_item_id);
  if (inventoryItemIds.length === 0 || new Set(inventoryItemIds).size !== inventoryItemIds.length) {
    return { status: "error", code: "recipe-corrupt" };
  }

  const { data: inventoryData, error: inventoryError } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id")
    .eq("user_id", user.id)
    .in("id", inventoryItemIds) as { data: SavedAiRecipeCookInventoryItem[] | null; error: { message: string } | null };

  if (inventoryError) {
    console.warn("Supabase could not load saved AI recipe inventory items for consumption.");
    return { status: "error", code: "unexpected-error" };
  }

  const inventoryItems = await loadAndAttachRecipeAiUnitMeasures(recipeClient as unknown as RecipeAiUnitMeasureClient, user.id, inventoryData ?? [], "saved AI recipe consumption");
  const validationError = validateSavedAiRecipeCookInventory(recipe, inventoryItems, getCurrentInventoryExpirationDateKey());
  if (validationError) return { status: "error", code: validationError };

  const planResult = buildSavedAiRecipeCookPlan(recipe, inventoryItems, request.meal_type);
  if (!planResult.ok) return { status: "error", code: planResult.code };
  const budget = await loadRecipeCalorieBudget(recipeClient as unknown as RecipeBudgetClient, user.id);
  const recipeNutrition = buildSavedAiRecipeCookPlan(recipe, inventoryItems, request.meal_type);
  if (budget && recipeNutrition.ok) {
    const suggestion = { title: recipe.title, description: recipe.description, estimated_minutes: recipe.estimated_minutes, servings: recipe.servings, ingredients: recipe.ingredients.map(({ inventory_item_id, name, quantity, unit }) => ({ inventory_item_id, name, quantity, unit })), steps: recipe.steps };
    if (!isRecipeServingWithinCalorieBudget(validateAndAdjustAiRecipeCalories(suggestion, inventoryItems, budget).nutrition.perServing?.calories ?? Infinity, budget)) return { status: "error", code: "calorie-budget-exceeded" };
  }

  const { error: consumeError } = await recipeClient.rpc("consume_meal_builder_items_and_log_meal", {
    p_meal_name: planResult.plan.mealName,
    p_meal_type: planResult.plan.mealType,
    p_lines: planResult.plan.lines,
  }) as { data: string | null; error: { code?: string; message: string } | null };

  if (consumeError) {
    console.warn("Supabase could not consume saved AI recipe items and log a meal.");
    return { status: "error", code: mapSavedAiRecipeCookRpcError(consumeError) };
  }

  revalidatePath(RECIPES_PATH);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");

  return { status: "success" };
}

/** Creates a cooked batch while consuming inventory, without recording a meal. */
export async function createSavedAiRecipeCookedBatchAction(input: unknown): Promise<CreateSavedAiRecipeCookedBatchResult> {
  const request = parseCreateSavedAiRecipeCookedBatchInput(input);
  if (!request) return { status: "error", code: "invalid-input" };

  const supabase = await createClient();
  let user: { id: string };
  try {
    user = await requireAuthenticatedUser(supabase, "saved AI recipe cooked batch creation");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const recipeClient = supabase as unknown as CookSavedAiRecipeSupabaseClient;
  const { data: existingBatch, error: existingBatchError } = await recipeClient
    .from("user_saved_ai_recipe_cooked_batches")
    .select("source_recipe_id, source_measurement_updated_at")
    .eq("id", request.request_id)
    .eq("user_id", user.id)
    .maybeSingle() as {
      data: { source_recipe_id: string | null; source_measurement_updated_at: string | null } | null;
      error: { message: string } | null;
    };
  if (existingBatchError) return { status: "error", code: "unexpected-error" };
  if (existingBatch) {
    return existingBatch.source_recipe_id === request.recipe_id
      && existingBatch.source_measurement_updated_at !== null
      && Date.parse(existingBatch.source_measurement_updated_at) === Date.parse(request.expected_measurement_updated_at)
      ? { status: "success" }
      : { status: "error", code: "idempotency-conflict" };
  }
  const { data: recipeData, error: recipeError } = await recipeClient
    .from("user_saved_ai_recipes")
    .select("id, user_id, title, description, estimated_minutes, servings, steps, source_priority_mode, fingerprint, created_at, user_saved_ai_recipe_ingredients(id, recipe_id, user_id, inventory_item_id, name, quantity, unit, sort_order, created_at)")
    .eq("id", request.recipe_id)
    .eq("user_id", user.id)
    .maybeSingle() as { data: SavedAiRecipeRow | null; error: { message: string } | null };
  if (recipeError) return { status: "error", code: "unexpected-error" };
  if (!recipeData) return { status: "error", code: "recipe-not-found" };

  const recipe = toSavedAiRecipe(recipeData);
  if (!recipe || recipe.user_id !== user.id || recipe.id !== request.recipe_id) return { status: "error", code: "recipe-corrupt" };
  const inventoryItemIds = recipe.ingredients.map((ingredient) => ingredient.inventory_item_id);
  if (inventoryItemIds.length === 0 || new Set(inventoryItemIds).size !== inventoryItemIds.length) return { status: "error", code: "recipe-corrupt" };

  const { data: inventoryData, error: inventoryError } = await recipeClient
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id")
    .eq("user_id", user.id)
    .in("id", inventoryItemIds) as { data: SavedAiRecipeCookInventoryItem[] | null; error: { message: string } | null };
  if (inventoryError) return { status: "error", code: "unexpected-error" };

  const inventoryItems = await loadAndAttachRecipeAiUnitMeasures(recipeClient as unknown as RecipeAiUnitMeasureClient, user.id, inventoryData ?? [], "saved AI recipe cooked batch creation");
  const validationError = validateSavedAiRecipeCookInventory(recipe, inventoryItems, getCurrentInventoryExpirationDateKey());
  if (validationError) {
    if (["recipe-corrupt", "recipe-stale", "insufficient-stock", "expired-item", "nutrition-unavailable", "incompatible-unit", "too-many-items"].includes(validationError)) {
      return { status: "error", code: validationError as CreateSavedAiRecipeCookedBatchErrorCode };
    }
    return { status: "error", code: "unexpected-error" };
  }
  const plan = buildSavedAiRecipeCookPlan(recipe, inventoryItems, "other");
  if (!plan.ok) {
    if (["recipe-corrupt", "recipe-stale", "insufficient-stock", "expired-item", "nutrition-unavailable", "incompatible-unit", "too-many-items"].includes(plan.code)) {
      return { status: "error", code: plan.code as CreateSavedAiRecipeCookedBatchErrorCode };
    }
    return { status: "error", code: "unexpected-error" };
  }

  const { error } = await recipeClient.rpc(
    "create_saved_ai_recipe_cooked_batch",
    buildSavedAiRecipeCookedBatchRpcPayload(request, plan.plan.lines),
  ) as { data: string | null; error: { message: string } | null };
  if (error) return { status: "error", code: mapCreateSavedAiRecipeCookedBatchRpcError(error) };

  revalidatePath(RECIPES_PATH);
  revalidatePath("/inventory");
  return { status: "success" };
}

/** UI boundary: recipe ownership and measurement version are bound by the server component. */
export async function createSavedAiRecipeCookedBatchUiAction(
  recipeId: string,
  measurementUpdatedAt: string,
  input: unknown,
): Promise<CreateSavedAiRecipeCookedBatchResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { status: "error", code: "invalid-input" };
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || typeof value.requestId !== "string") return { status: "error", code: "invalid-input" };
  return createSavedAiRecipeCookedBatchAction({
    recipe_id: recipeId,
    request_id: value.requestId,
    expected_measurement_updated_at: measurementUpdatedAt,
  });
}

/** Atomically records one explicit portion of an existing cooked batch. */
export async function consumeCookedBatchAndLogMealAction(input: unknown): Promise<ConsumeCookedBatchResult> {
  const request = parseConsumeCookedBatchInput(input);
  if (!request) return { status: "error", code: "invalid-input" };

  const supabase = await createClient();
  try {
    await requireAuthenticatedUser(supabase, "cooked batch consumption");
  } catch {
    return { status: "error", code: "unauthenticated" };
  }

  const { error } = await (supabase as unknown as CookSavedAiRecipeSupabaseClient).rpc(
    "consume_cooked_batch_and_log_meal",
    buildConsumeCookedBatchRpcPayload(request),
  ) as { data: unknown; error: { message: string } | null };
  if (error) return { status: "error", code: mapConsumeCookedBatchRpcError(error) };

  revalidatePath(RECIPES_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");
  return { status: "success" };
}

/** UI boundary: batch ownership and optimistic-lock version never cross into client data. */
export async function consumeCookedBatchUiAction(
  batchId: string,
  batchUpdatedAt: string,
  input: unknown,
): Promise<ConsumeCookedBatchResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { status: "error", code: "invalid-input" };
  const value = input as Record<string, unknown>;
  const allowed = ["requestId", "mode", "quantity", "mealType"];
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some((key) => !allowed.includes(key))) {
    return { status: "error", code: "invalid-input" };
  }
  const base = {
    request_id: value.requestId,
    batch_id: batchId,
    meal_type: value.mealType,
    expected_batch_updated_at: batchUpdatedAt,
  };
  return consumeCookedBatchAndLogMealAction(value.mode === "servings"
    ? { ...base, servings_consumed: value.quantity }
    : value.mode === "grams"
      ? { ...base, cooked_weight_consumed_g: value.quantity }
      : { ...base, invalid_mode: value.mode });
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
    .select("id, name, quantity, unit, expires_at, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id")
    .eq("user_id", user.id)
    .in("id", inventoryItemIds)
    .gt("quantity", 0) as { data: RecipeAiCookInventoryItem[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load AI recipe consumption inventory items:", error.message);
    return { status: "error", code: "unexpected-error" };
  }

  const inventoryItems = await loadAndAttachRecipeAiUnitMeasures(recipeClient as unknown as RecipeAiUnitMeasureClient, user.id, data ?? [], "AI recipe consumption");
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
  const budget = await loadRecipeCalorieBudget(recipeClient as unknown as RecipeBudgetClient, user.id);
  if (budget && !isRecipeServingWithinCalorieBudget(nutrition.perServing.calories, budget)) return { status: "error", code: "calorie-budget-exceeded" };

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
