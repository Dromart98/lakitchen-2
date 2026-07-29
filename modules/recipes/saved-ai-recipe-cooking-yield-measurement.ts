export type SavedRecipeCookingYieldMeasurement = Readonly<{
  rawWeightG: number;
  cookedWeightG: number;
  servings: number;
}>;

export type SavedRecipeCookingYieldMeasurementInput = SavedRecipeCookingYieldMeasurement & Readonly<{
  recipeId: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSavedRecipeCookingYieldMeasurement(input: unknown): SavedRecipeCookingYieldMeasurementInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["recipeId", "rawWeightG", "cookedWeightG", "servings"].includes(key))) return null;
  if (typeof value.recipeId !== "string" || !UUID_PATTERN.test(value.recipeId)) return null;
  if (typeof value.rawWeightG !== "number" || !Number.isFinite(value.rawWeightG) || value.rawWeightG <= 0) return null;
  if (typeof value.cookedWeightG !== "number" || !Number.isFinite(value.cookedWeightG) || value.cookedWeightG <= 0) return null;
  if (typeof value.servings !== "number" || !Number.isSafeInteger(value.servings) || value.servings <= 0) return null;

  return Object.freeze({
    recipeId: value.recipeId,
    rawWeightG: value.rawWeightG,
    cookedWeightG: value.cookedWeightG,
    servings: value.servings,
  });
}

export function toSavedRecipeCookingYieldMeasurement(row: unknown): SavedRecipeCookingYieldMeasurement | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const rawWeightG = Number(value.raw_weight_g);
  const cookedWeightG = Number(value.cooked_weight_g);
  const servings = Number(value.servings);
  if (!Number.isFinite(rawWeightG) || rawWeightG <= 0 || !Number.isFinite(cookedWeightG) || cookedWeightG <= 0 || !Number.isSafeInteger(servings) || servings <= 0) return null;
  return Object.freeze({ rawWeightG, cookedWeightG, servings });
}
