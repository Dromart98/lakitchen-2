import { z } from "zod";
import { planDateKeySchema } from "@/modules/plans/plan-date";

import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";
import { hasCompleteInventoryNutritionValues, isInventoryNutritionBasis, type InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import { buildRecipeAiNutritionAllocations } from "@/modules/recipes/recipe-ai-nutrition";
import { getUrgentRecipeAiInventoryItemIds } from "@/modules/recipes/recipe-ai-urgency";
import { RECIPE_MAX_INGREDIENTS } from "@/modules/recipes/recipe-limits";
import { estimateRecipeNutrition } from "@/modules/recipes/recipe-nutrition";

export const DAILY_PLAN_MAX_INVENTORY_ITEMS = 40;
export const DAILY_PLAN_MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type DailyPlanMealType = (typeof DAILY_PLAN_MEAL_TYPES)[number];
export type DailyPlanPriorityMode = "balanced" | "expiration";
export const DAILY_PLAN_PRIORITY_MODES = ["balanced", "expiration"] as const;
export const DAILY_PLAN_MAX_MINUTES = [15, 30, 45, 60] as const;

export const dailyPlanPublicRequestSchema = z.object({
  plan_date: planDateKeySchema,
  priority_mode: z.enum(DAILY_PLAN_PRIORITY_MODES),
  max_minutes_per_meal: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
}).strict();

export type DailyPlanPublicRequest = z.infer<typeof dailyPlanPublicRequestSchema>;

export type DailyPlanTarget = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyPlanInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expires_at: string | null;
  category: string | null;
  nutrition_basis: InventoryNutritionBasis;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyPlanInventorySourceItem = {
  id: string; name: string; quantity: number | null; unit: string; expires_at: string | null; category: string | null;
  nutrition_basis: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
};

export type DailyPlanInventoryExclusionReason = "non-positive-quantity" | "expired" | "missing-nutrition-basis" | "incomplete-nutrition" | "incompatible-unit";
export type DailyPlanInventoryReadiness = {
  availableCount: number;
  usable: DailyPlanInventoryItem[];
  excluded: Array<{ item: DailyPlanInventorySourceItem; reason: DailyPlanInventoryExclusionReason }>;
  canGenerate: boolean;
  hasLimitedVariety: boolean;
};

export type DailyPlanIngredient = {
  inventory_item_id: string;
  name: string;
  quantity: number;
  unit: string;
};

export type DailyPlanMeal = {
  meal_type: DailyPlanMealType;
  title: string;
  description: string;
  estimated_minutes: number;
  ingredients: DailyPlanIngredient[];
  steps: string[];
};

export type DailyPlanProviderOutput = {
  status: "success" | "needs-clarification" | "error";
  message: string | null;
  meals: DailyPlanMeal[];
};

export type DailyPlanNutrition = DailyPlanTarget;
export type DailyPlanFit = "close" | "acceptable" | "far";

export type DailyPlanSuccessResult = {
  status: "success";
  target: DailyPlanTarget;
  total: DailyPlanNutrition;
  difference: DailyPlanNutrition;
  fit: DailyPlanFit;
  meals: Array<DailyPlanMeal & { nutrition: DailyPlanNutrition }>;
};

export type DailyPlanErrorCode =
  | "unauthenticated"
  | "profile-required"
  | "insufficient-inventory"
  | "nutrition-unavailable"
  | "missing-api-key"
  | "ai-burst-limit"
  | "daily-ai-limit"
  | "ai-access-unavailable"
  | "ai-feature-disabled"
  | "provider-timeout"
  | "provider-error"
  | "invalid-ai-response"
  | "invalid-input"
  | "unexpected-error";

export type DailyPlanActionResult =
  | DailyPlanSuccessResult
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: DailyPlanErrorCode };

export type DailyPlanGenerationResult =
  | { status: "success"; meals: DailyPlanMeal[] }
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: DailyPlanErrorCode };

const providerIngredientSchema = z.object({
  inventory_item_id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().finite(),
  unit: z.string().trim().min(1).max(16),
}).strict();

const providerMealSchema = z.object({
  meal_type: z.enum(DAILY_PLAN_MEAL_TYPES),
  title: z.string().trim().min(1).max(90),
  description: z.string().trim().min(1).max(280),
  estimated_minutes: z.number().int().min(1).max(60),
  ingredients: z.array(providerIngredientSchema).min(1).max(RECIPE_MAX_INGREDIENTS),
  steps: z.array(z.string().trim().min(8).max(280)).min(2).max(12),
}).strict();

export const dailyPlanProviderResponseSchema = z.object({
  status: z.enum(["success", "needs-clarification", "error"]),
  message: z.string().trim().min(1).max(240).nullable(),
  meals: z.array(providerMealSchema).max(4),
}).strict().superRefine((value, context) => {
  if (value.status === "success") {
    if (value.message !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Success requires null message." });
    if (value.meals.length !== 4) context.addIssue({ code: z.ZodIssueCode.custom, path: ["meals"], message: "Success requires four meals." });
  } else if (value.meals.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["meals"], message: "Non-success responses cannot include meals." });
  }
});

export const DAILY_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "message", "meals"],
  properties: {
    status: { type: "string", enum: ["success", "needs-clarification", "error"] },
    message: { type: ["string", "null"], minLength: 1, maxLength: 240 },
    meals: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["meal_type", "title", "description", "estimated_minutes", "ingredients", "steps"],
        properties: {
          meal_type: { type: "string", enum: DAILY_PLAN_MEAL_TYPES },
          title: { type: "string", minLength: 1, maxLength: 90 },
          description: { type: "string", minLength: 1, maxLength: 280 },
          estimated_minutes: { type: "integer", minimum: 1, maximum: 60 },
          ingredients: {
            type: "array",
            minItems: 1,
            maxItems: RECIPE_MAX_INGREDIENTS,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["inventory_item_id", "name", "quantity", "unit"],
              properties: {
                inventory_item_id: { type: "string", minLength: 1, maxLength: 100 },
                name: { type: "string", minLength: 1, maxLength: 120 },
                quantity: { type: "number", exclusiveMinimum: 0 },
                unit: { type: "string", minLength: 1, maxLength: 16 },
              },
            },
          },
          steps: { type: "array", minItems: 2, maxItems: 12, items: { type: "string", minLength: 8, maxLength: 280 } },
        },
      },
    },
  },
} as const;

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase("es-ES").replace(/\s+/g, " ");
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("es-ES").replace(/\s+/g, " ");
}

function isCompatibleUnitAndBasis(unit: string, basis: InventoryNutritionBasis) {
  if (basis === "per_100g") return unit === "g" || unit === "kg";
  if (basis === "per_100ml") return unit === "ml" || unit === "l";
  return unit === "ud";
}

export function buildDailyPlanTarget(profile: { target_calories: number | null; target_protein_g: number | null; target_carbs_g: number | null; target_fat_g: number | null } | null): DailyPlanTarget | null {
  if (!profile) return null;
  const target = {
    calories: profile.target_calories,
    protein_g: profile.target_protein_g,
    carbs_g: profile.target_carbs_g,
    fat_g: profile.target_fat_g,
  };
  if ([target.calories, target.protein_g, target.carbs_g, target.fat_g].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    return target as DailyPlanTarget;
  }
  return null;
}

export function getDailyPlanInventoryReadiness<T extends DailyPlanInventorySourceItem>(items: T[], todayKey: string): DailyPlanInventoryReadiness {
  const excluded: DailyPlanInventoryReadiness["excluded"] = [];
  const eligible = items.filter((item) => {
    let reason: DailyPlanInventoryExclusionReason | null = null;
    if (!Number.isFinite(item.quantity) || item.quantity === null || item.quantity <= 0) reason = "non-positive-quantity";
    else if (item.expires_at && getInventoryExpirationDayDifference(item.expires_at, todayKey) < 0) reason = "expired";
    else if (!isInventoryNutritionBasis(item.nutrition_basis)) reason = "missing-nutrition-basis";
    else if (!hasCompleteInventoryNutritionValues(item)) reason = "incomplete-nutrition";
    else if (!isCompatibleUnitAndBasis(item.unit, item.nutrition_basis)) reason = "incompatible-unit";
    if (reason) excluded.push({ item, reason });
    return !reason;
  });
  const usable = eligible
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity as number,
      unit: item.unit,
      expires_at: item.expires_at,
      category: item.category,
      nutrition_basis: item.nutrition_basis as InventoryNutritionBasis,
      calories: item.calories as number,
      protein_g: item.protein_g as number,
      carbs_g: item.carbs_g as number,
      fat_g: item.fat_g as number,
    }))
    .sort((a, b) => {
      const aTime = a.expires_at ? Date.parse(`${a.expires_at}T00:00:00.000Z`) : Number.POSITIVE_INFINITY;
      const bTime = b.expires_at ? Date.parse(`${b.expires_at}T00:00:00.000Z`) : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      const byName = a.name.localeCompare(b.name, "es");
      return byName || a.id.localeCompare(b.id);
    })
    .slice(0, DAILY_PLAN_MAX_INVENTORY_ITEMS);
  return {
    availableCount: items.filter((item) => Number.isFinite(item.quantity) && item.quantity !== null && item.quantity > 0).length,
    usable,
    excluded,
    canGenerate: usable.length >= 2,
    hasLimitedVariety: usable.length >= 2 && usable.length <= 3,
  };
}

export function buildUsableDailyPlanInventoryItems<T extends DailyPlanInventorySourceItem>(items: T[], todayKey: string): DailyPlanInventoryItem[] {
  return getDailyPlanInventoryReadiness(items, todayKey).usable;
}

export function buildDailyPlanInputText(request: DailyPlanPublicRequest, target: DailyPlanTarget, inventoryItems: DailyPlanInventoryItem[], referenceDate: string) {
  const urgentIds = request.priority_mode === "expiration" ? [...getUrgentRecipeAiInventoryItemIds(inventoryItems, referenceDate)].sort() : [];
  return JSON.stringify({
    language: "es",
    plan_date: request.plan_date,
    priority_mode: request.priority_mode,
    target,
    expiration_context: request.priority_mode === "expiration" ? { reference_date: referenceDate, urgent_inventory_item_ids: urgentIds } : undefined,
    constraints: {
      meal_types: DAILY_PLAN_MEAL_TYPES,
      exact_meal_count: 4,
      max_minutes_per_meal: request.max_minutes_per_meal,
      use_only_inventory_items: true,
      keep_inventory_units_exactly: true,
      do_not_include_nutrition: true,
      do_not_store_or_consume_inventory: true,
    },
    inventory: inventoryItems.map((item) => ({ ...item })),
  });
}

export function validateDailyPlanProviderOutput(request: DailyPlanPublicRequest, inventoryItems: DailyPlanInventoryItem[], output: unknown, referenceDate: string): DailyPlanGenerationResult {
  const parsed = dailyPlanProviderResponseSchema.safeParse(output);
  if (!parsed.success) return { status: "error", code: "invalid-ai-response" };
  if (parsed.data.status === "error") return { status: "error", code: "invalid-ai-response" };
  if (parsed.data.status === "needs-clarification") return { status: "needs-clarification", message: parsed.data.message ?? "Necesito más inventario utilizable para crear el plan." };

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const mealTypes = new Set<DailyPlanMealType>();
  const titles = new Set<string>();
  const urgentIds = getUrgentRecipeAiInventoryItemIds(inventoryItems, referenceDate);
  let usesUrgent = false;
  const dailyUsed = new Map<string, number>();

  for (let index = 0; index < DAILY_PLAN_MEAL_TYPES.length; index += 1) {
    const meal = parsed.data.meals[index];
    if (!meal || meal.meal_type !== DAILY_PLAN_MEAL_TYPES[index]) return { status: "error", code: "invalid-ai-response" };
    if (meal.estimated_minutes > request.max_minutes_per_meal) return { status: "error", code: "invalid-ai-response" };
    if (mealTypes.has(meal.meal_type)) return { status: "error", code: "invalid-ai-response" };
    mealTypes.add(meal.meal_type);
    const title = normalizeTitle(meal.title);
    if (titles.has(title)) return { status: "error", code: "invalid-ai-response" };
    titles.add(title);

    const mealIds = new Set<string>();
    for (const ingredient of meal.ingredients) {
      if (mealIds.has(ingredient.inventory_item_id)) return { status: "error", code: "invalid-ai-response" };
      mealIds.add(ingredient.inventory_item_id);
      const item = inventoryById.get(ingredient.inventory_item_id);
      if (!item) return { status: "error", code: "invalid-ai-response" };
      if (normalizeName(ingredient.name) !== normalizeName(item.name)) return { status: "error", code: "invalid-ai-response" };
      if (ingredient.unit !== item.unit) return { status: "error", code: "invalid-ai-response" };
      if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0 || ingredient.quantity > item.quantity) return { status: "error", code: "invalid-ai-response" };
      if (item.expires_at && getInventoryExpirationDayDifference(item.expires_at, referenceDate) < 0) return { status: "error", code: "invalid-ai-response" };
      if (!isCompatibleUnitAndBasis(item.unit, item.nutrition_basis)) return { status: "error", code: "invalid-ai-response" };
      dailyUsed.set(item.id, (dailyUsed.get(item.id) ?? 0) + ingredient.quantity);
      if (urgentIds.has(item.id)) usesUrgent = true;
    }
  }

  for (const [id, quantity] of dailyUsed) {
    const item = inventoryById.get(id);
    if (!item || quantity > item.quantity) return { status: "error", code: "invalid-ai-response" };
  }
  if (request.priority_mode === "expiration" && urgentIds.size > 0 && !usesUrgent) return { status: "error", code: "invalid-ai-response" };

  return { status: "success", meals: parsed.data.meals };
}

function toPublicNutrition(total: { calories: number; proteinG: number; carbsG: number; fatG: number }): DailyPlanNutrition {
  return { calories: total.calories, protein_g: total.proteinG, carbs_g: total.carbsG, fat_g: total.fatG };
}

export function enrichDailyPlanWithDeterministicNutrition(meals: DailyPlanMeal[], inventoryItems: DailyPlanInventoryItem[], target: DailyPlanTarget): DailyPlanSuccessResult | { status: "error"; code: "nutrition-unavailable" } {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const enrichedMeals: DailyPlanSuccessResult["meals"] = [];
  let total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

  for (const meal of meals) {
    const recipeLike = { title: meal.title, description: meal.description, estimated_minutes: meal.estimated_minutes, servings: 1, ingredients: meal.ingredients, steps: meal.steps };
    const { allocations, missingItemIds } = buildRecipeAiNutritionAllocations(recipeLike, inventoryById);
    const nutrition = estimateRecipeNutrition(allocations, 1);
    if (missingItemIds.size > 0 || !nutrition.isComplete || !nutrition.total) return { status: "error", code: "nutrition-unavailable" };
    const mealNutrition = toPublicNutrition(nutrition.total);
    total = {
      calories: total.calories + mealNutrition.calories,
      protein_g: total.protein_g + mealNutrition.protein_g,
      carbs_g: total.carbs_g + mealNutrition.carbs_g,
      fat_g: total.fat_g + mealNutrition.fat_g,
    };
    enrichedMeals.push({ ...meal, ingredients: meal.ingredients.map((ingredient) => ({ ...ingredient })), steps: [...meal.steps], nutrition: mealNutrition });
  }

  const difference = {
    calories: total.calories - target.calories,
    protein_g: total.protein_g - target.protein_g,
    carbs_g: total.carbs_g - target.carbs_g,
    fat_g: total.fat_g - target.fat_g,
  };
  return { status: "success", target, total, difference, fit: evaluateDailyPlanFit(total, target), meals: enrichedMeals };
}

function withinPercent(value: number, target: number, percent: number) {
  return Math.abs(value - target) <= target * percent;
}

export function evaluateDailyPlanFit(total: Pick<DailyPlanNutrition, "calories" | "protein_g">, target: Pick<DailyPlanTarget, "calories" | "protein_g">): DailyPlanFit {
  if (withinPercent(total.calories, target.calories, 0.10) && withinPercent(total.protein_g, target.protein_g, 0.15)) return "close";
  if (withinPercent(total.calories, target.calories, 0.20) && withinPercent(total.protein_g, target.protein_g, 0.25)) return "acceptable";
  return "far";
}
