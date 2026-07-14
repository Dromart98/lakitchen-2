"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import { isMealType } from "@/modules/meals/meal-types";
import { buildRecipeConsumptionLines } from "@/modules/recipes/recipe-consumption";
import {
  matchRecipesToInventory,
  normalizeRecipeFilterMode,
  type RecipeIngredient,
  type RecipeInventoryItem,
  type RecipeTemplate,
} from "@/modules/recipes/recipe-matching";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";

const RECIPES_PATH = "/recipes";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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

  if (!UUID_PATTERN.test(recipeId)) redirectWithRecipeError(mode, "recipe-not-found");
  if (!isMealType(mealType)) redirectWithRecipeError(mode, "consume-failed");

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
  const [match] = matchRecipesToInventory([recipe], inventoryItems, getCurrentInventoryExpirationDateKey());

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
    p_meal_name: match.recipe.title,
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
