export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "other"] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Desayuno",
  lunch: "Comida",
  snack: "Merienda",
  dinner: "Cena",
  other: "Otro",
};

const MEAL_TYPE_SET = new Set<string>(MEAL_TYPES);

export function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && MEAL_TYPE_SET.has(value);
}

export function normalizeMealType(value: unknown): MealType {
  return isMealType(value) ? value : "other";
}
