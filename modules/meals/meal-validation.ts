import { isMealType, type MealType } from "./meal-types";

export type MealLogInput = {
  name: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type MealValidationError =
  | "meal-name-required"
  | "meal-name-too-long"
  | "invalid-meal-type"
  | "invalid-macros";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MEAL_NAME_LENGTH = 120;

export function isMealLogId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateMealName(value: unknown): { value: string } | { error: MealValidationError } {
  const name = String(value ?? "").trim();

  if (!name) {
    return { error: "meal-name-required" };
  }

  if (name.length > MAX_MEAL_NAME_LENGTH) {
    return { error: "meal-name-too-long" };
  }

  return { value: name };
}

export function validateMealType(value: unknown): { value: MealType } | { error: MealValidationError } {
  const mealType = String(value ?? "").trim();

  if (!isMealType(mealType)) {
    return { error: "invalid-meal-type" };
  }

  return { value: mealType };
}

export function validateMacro(value: unknown): { value: number } | { error: MealValidationError } {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return { error: "invalid-macros" };
  }

  const macro = Number(rawValue);

  if (!Number.isFinite(macro) || !Number.isInteger(macro) || macro < 0) {
    return { error: "invalid-macros" };
  }

  return { value: macro };
}

export function validateMealLogInput(formData: FormData): { value: MealLogInput } | { error: MealValidationError } {
  const name = validateMealName(formData.get("name"));
  if ("error" in name) return name;

  const mealType = validateMealType(formData.get("meal_type"));
  if ("error" in mealType) return mealType;

  const calories = validateMacro(formData.get("calories"));
  if ("error" in calories) return calories;

  const proteinG = validateMacro(formData.get("protein_g"));
  if ("error" in proteinG) return proteinG;

  const carbsG = validateMacro(formData.get("carbs_g"));
  if ("error" in carbsG) return carbsG;

  const fatG = validateMacro(formData.get("fat_g"));
  if ("error" in fatG) return fatG;

  return {
    value: {
      name: name.value,
      mealType: mealType.value,
      calories: calories.value,
      proteinG: proteinG.value,
      carbsG: carbsG.value,
      fatG: fatG.value,
    },
  };
}
