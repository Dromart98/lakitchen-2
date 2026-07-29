import type { NutritionTotals } from "@/modules/recipes/recipe-nutrition";

export type SavedAiRecipeCookedBatchSnapshot = Readonly<{
  recipeTitle: string;
  rawWeightG: number;
  cookedWeightG: number;
  servings: number;
  totalNutrition: Readonly<NutritionTotals>;
  consumedCookedWeightG: number;
  createdAt: string;
  updatedAt: string;
}>;

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && (value.trim() === "" || value.trim() !== value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value || value === "") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Converts one trusted database projection into an immutable cooked-batch
 * snapshot. Owner, batch and source-recipe identifiers remain private.
 */
export function parseSavedAiRecipeCookedBatchRow(row: unknown): SavedAiRecipeCookedBatchSnapshot | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const recipeTitle = typeof value.recipe_title === "string" ? value.recipe_title : null;
  const recipeTitleLength = recipeTitle === null ? 0 : Array.from(recipeTitle).length;
  const rawWeightG = parseFiniteNumber(value.raw_weight_g);
  const cookedWeightG = parseFiniteNumber(value.cooked_weight_g);
  const servings = parseFiniteNumber(value.servings);
  const calories = parseFiniteNumber(value.total_calories);
  const proteinG = parseFiniteNumber(value.total_protein_g);
  const carbsG = parseFiniteNumber(value.total_carbs_g);
  const fatG = parseFiniteNumber(value.total_fat_g);
  const consumedCookedWeightG = parseFiniteNumber(value.consumed_cooked_weight_g);
  const createdAt = parseTimestamp(value.created_at);
  const updatedAt = parseTimestamp(value.updated_at);

  if (
    recipeTitle === null
    || recipeTitle.trim() !== recipeTitle
    || recipeTitleLength < 1
    || recipeTitleLength > 90
    || rawWeightG === null
    || rawWeightG <= 0
    || cookedWeightG === null
    || cookedWeightG <= 0
    || servings === null
    || !Number.isSafeInteger(servings)
    || servings <= 0
    || calories === null
    || calories < 0
    || proteinG === null
    || proteinG < 0
    || carbsG === null
    || carbsG < 0
    || fatG === null
    || fatG < 0
    || consumedCookedWeightG === null
    || consumedCookedWeightG < 0
    || consumedCookedWeightG > cookedWeightG
    || createdAt === null
    || updatedAt === null
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) return null;

  const totalNutrition = Object.freeze({ calories, proteinG, carbsG, fatG });
  return Object.freeze({
    recipeTitle,
    rawWeightG,
    cookedWeightG,
    servings,
    totalNutrition,
    consumedCookedWeightG,
    createdAt,
    updatedAt,
  });
}
