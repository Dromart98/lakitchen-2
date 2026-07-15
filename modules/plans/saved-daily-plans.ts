import { z } from "zod";

import {
  DAILY_PLAN_MAX_MINUTES,
  DAILY_PLAN_MEAL_TYPES,
  DAILY_PLAN_PRIORITY_MODES,
  type DailyPlanMeal,
  type DailyPlanSuccessResult,
} from "@/modules/plans/daily-plan-ai";
import { RECIPE_MAX_INGREDIENTS } from "@/modules/recipes/recipe-limits";

const nutritionSchema = z.object({
  calories: z.number().finite(),
  protein_g: z.number().finite(),
  carbs_g: z.number().finite(),
  fat_g: z.number().finite(),
}).strict();

const ingredientSchema = z.object({
  inventory_item_id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().finite(),
  unit: z.string().trim().min(1).max(16),
}).strict();

const mealSchema = z.object({
  meal_type: z.enum(DAILY_PLAN_MEAL_TYPES),
  title: z.string().trim().min(1).max(90),
  description: z.string().trim().min(1).max(280),
  estimated_minutes: z.number().int().min(1).max(60),
  ingredients: z.array(ingredientSchema).min(1).max(RECIPE_MAX_INGREDIENTS),
  steps: z.array(z.string().trim().min(8).max(280)).min(2).max(12),
  nutrition: nutritionSchema,
}).strict();

const successPlanSchema = z.object({
  status: z.literal("success"),
  target: nutritionSchema,
  total: nutritionSchema,
  difference: nutritionSchema,
  fit: z.enum(["close", "acceptable", "far"]),
  meals: z.array(mealSchema).length(4),
}).strict().superRefine((value, context) => {
  for (let index = 0; index < DAILY_PLAN_MEAL_TYPES.length; index += 1) {
    if (value.meals[index]?.meal_type !== DAILY_PLAN_MEAL_TYPES[index]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meals", index, "meal_type"],
        message: "Meals must use the expected order.",
      });
    }
  }
});

export const saveDailyPlanRequestSchema = z.object({
  priority_mode: z.enum(DAILY_PLAN_PRIORITY_MODES),
  max_minutes_per_meal: z.union(DAILY_PLAN_MAX_MINUTES.map((value) => z.literal(value)) as [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>]),
  plan: successPlanSchema,
}).strict();

export type SaveDailyPlanRequest = z.infer<typeof saveDailyPlanRequestSchema>;

export type SaveDailyPlanResult =
  | { status: "success"; code: "saved" | "already-saved"; planId: string }
  | { status: "error"; code: "invalid-input" | "unauthenticated" | "profile-required" | "inventory-changed" | "save-failed" | "unexpected-error" };

export function buildProviderOutputForSavedPlan(request: SaveDailyPlanRequest) {
  return {
    status: "success" as const,
    message: null,
    meals: request.plan.meals.map(({ nutrition: _nutrition, ...meal }) => meal as DailyPlanMeal),
  };
}

const savedDailyPlanRowSchema = z.object({
  id: z.string().uuid(),
  plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority_mode: z.enum(DAILY_PLAN_PRIORITY_MODES),
  max_minutes_per_meal: z.union(DAILY_PLAN_MAX_MINUTES.map((value) => z.literal(value)) as [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>]),
  target: nutritionSchema,
  total: nutritionSchema,
  difference: nutritionSchema,
  fit: z.enum(["close", "acceptable", "far"]),
  meals: z.array(mealSchema).length(4),
  created_at: z.string().min(1),
}).strict();

export type SavedDailyPlan = Omit<z.infer<typeof savedDailyPlanRowSchema>, "meals"> & {
  meals: DailyPlanSuccessResult["meals"];
};

export function toSavedDailyPlan(value: unknown): SavedDailyPlan | null {
  const parsed = savedDailyPlanRowSchema.safeParse(value);
  return parsed.success ? parsed.data as SavedDailyPlan : null;
}
