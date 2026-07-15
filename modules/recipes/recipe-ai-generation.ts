import { z } from "zod";

import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";

import type { RecipeAiSuggestionWithNutrition } from "@/modules/recipes/recipe-ai-nutrition";
import { hasRecipeAiUrgencyCoverage } from "@/modules/recipes/recipe-ai-urgency";

export const RECIPE_AI_MAX_INVENTORY_ITEMS = 40;
export const RECIPE_AI_MODEL_DEFAULT = "gpt-5.6-terra";
export const RECIPE_AI_TIMEOUT_MS = 25_000;
export const RECIPE_AI_MAX_OUTPUT_TOKENS = 4_000;
export const RECIPE_AI_MIN_INVENTORY_ITEMS = 2;

export type RecipeAiPriorityMode = "balanced" | "expiration";

export const RECIPE_AI_PRIORITY_MODES = ["balanced", "expiration"] as const;

export const recipeAiRequestSchema = z.object({
  max_minutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  servings: z.number().int().min(1).max(4),
  suggestion_count: z.number().int().min(1).max(3),
  priority_mode: z.enum(RECIPE_AI_PRIORITY_MODES),
}).strict();

export type RecipeAiRequest = z.infer<typeof recipeAiRequestSchema>;

export type RecipeAiExpirationContext = {
  todayKey: string;
  urgentInventoryItemIds: ReadonlySet<string>;
};

export type RecipeAiInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
  expires_at: string | null;
  nutrition_basis?: "per_100g" | "per_100ml" | "per_unit" | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export type RecipeAiIngredient = {
  inventory_item_id: string;
  name: string;
  quantity: number;
  unit: string;
};

export type RecipeAiSuggestion = {
  title: string;
  description: string;
  estimated_minutes: number;
  servings: number;
  ingredients: RecipeAiIngredient[];
  steps: string[];
};


export function filterUsableRecipeAiInventoryItems<T extends { expires_at: string | null }>(items: T[], todayKey: string): T[] {
  return items.filter((item) => {
    if (!item.expires_at) return true;
    return getInventoryExpirationDayDifference(item.expires_at, todayKey) >= 0;
  });
}

export type RecipeAiGenerationResult =
  | { status: "success"; recipes: RecipeAiSuggestion[] }
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: RecipeAiErrorCode };

export type RecipeAiActionResult =
  | { status: "success"; recipes: RecipeAiSuggestionWithNutrition[] }
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: RecipeAiErrorCode };

export type RecipeAiErrorCode =
  | "unauthenticated"
  | "empty-inventory"
  | "insufficient-inventory"
  | "missing-api-key"
  | "timeout"
  | "network-error"
  | "http-timeout"
  | "rate-limited"
  | "provider-error"
  | "incomplete-response"
  | "refusal"
  | "invalid-json"
  | "invalid-ai-response"
  | "invalid-input"
  | "unexpected-error";

const numericStringPattern = /^(?:0|[1-9]\d*)$/;

function parseStrictInteger(value: unknown): number | null {
  if (typeof value !== "string" || !numericStringPattern.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseRecipeAiRequest(input: unknown): RecipeAiRequest | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !["max_minutes", "servings", "suggestion_count", "priority_mode"].includes(key))) return null;

  const parsed = {
    max_minutes: parseStrictInteger(record.max_minutes),
    servings: parseStrictInteger(record.servings),
    suggestion_count: parseStrictInteger(record.suggestion_count),
    priority_mode: record.priority_mode,
  };

  const result = recipeAiRequestSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

const recipeAiProviderRecipeSchema = z.object({
  title: z.string().trim().min(1).max(90),
  description: z.string().trim().min(1).max(240),
  estimated_minutes: z.number().int().min(1).max(60),
  servings: z.number().int().min(1).max(4),
  ingredients: z.array(z.object({
    inventory_item_id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(120),
    quantity: z.number().positive().finite(),
    unit: z.string().trim().min(1).max(16),
  }).strict()).min(1).max(20),
  steps: z.array(z.string().trim().min(8).max(280)).min(2).max(12),
}).strict();

export const recipeAiProviderResponseSchema = z.object({
  status: z.enum(["success", "needs-clarification", "error"]),
  recipes: z.array(recipeAiProviderRecipeSchema).max(3),
  message: z.string().trim().min(1).max(240).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "success") {
    if (value.recipes.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["recipes"], message: "Success responses require recipes." });
    }
    if (value.message !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Success responses require a null message." });
    }
  }

  if (value.status === "needs-clarification") {
    if (value.recipes.length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["recipes"], message: "Clarification responses cannot include recipes." });
    }
    if (value.message === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Clarification responses require a message." });
    }
  }

  if (value.status === "error") {
    if (value.recipes.length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["recipes"], message: "Error responses cannot include recipes." });
    }
  }
});

export const RECIPE_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "recipes", "message"],
  properties: {
    status: { type: "string", enum: ["success", "needs-clarification", "error"] },
    recipes: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "estimated_minutes", "servings", "ingredients", "steps"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 90 },
          description: { type: "string", minLength: 1, maxLength: 240 },
          estimated_minutes: { type: "integer", minimum: 1, maximum: 60 },
          servings: { type: "integer", minimum: 1, maximum: 4 },
          ingredients: {
            type: "array",
            minItems: 1,
            maxItems: 20,
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
    message: { type: ["string", "null"], minLength: 1, maxLength: 240 },
  },
} as const;

export function buildRecipeAiInputText(
  request: RecipeAiRequest,
  inventoryItems: RecipeAiInventoryItem[],
  expirationContext?: RecipeAiExpirationContext,
): string {
  const items = inventoryItems.slice(0, RECIPE_AI_MAX_INVENTORY_ITEMS).map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    expires_at: item.expires_at,
  }));
  const inventoryItemIds = new Set(items.map((item) => item.id));
  const expirationPayload = request.priority_mode === "expiration" && expirationContext
    ? {
        expiration_context: {
          today_key: expirationContext.todayKey,
          urgent_inventory_item_ids: [...expirationContext.urgentInventoryItemIds]
            .filter((id) => inventoryItemIds.has(id))
            .sort(),
        },
      }
    : {};

  return JSON.stringify({
    language: "es",
    priority_mode: request.priority_mode,
    ...expirationPayload,
    constraints: {
      max_minutes: request.max_minutes,
      servings: request.servings,
      suggestion_count: request.suggestion_count,
      use_only_inventory_items: true,
      keep_inventory_units_exactly: true,
      do_not_store_or_consume_inventory: true,
    },
    inventory: items,
  });
}

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase("es-ES").replace(/\s+/g, " ");
}

export function validateRecipeAiProviderOutput(
  request: RecipeAiRequest,
  inventoryItems: RecipeAiInventoryItem[],
  output: unknown,
  urgentInventoryItemIds: ReadonlySet<string> = new Set(),
): RecipeAiGenerationResult {
  const parsed = recipeAiProviderResponseSchema.safeParse(output);
  if (!parsed.success) return { status: "error", code: "invalid-ai-response" };
  if (parsed.data.status === "error") return { status: "error", code: "invalid-ai-response" };
  if (parsed.data.status === "needs-clarification") return { status: "needs-clarification", message: parsed.data.message! };

  if (parsed.data.recipes.length > request.suggestion_count) return { status: "error", code: "invalid-ai-response" };

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const titles = new Set<string>();

  for (const recipe of parsed.data.recipes) {
    const title = normalizeTitle(recipe.title);
    if (titles.has(title)) return { status: "error", code: "invalid-ai-response" };
    titles.add(title);
    if (recipe.estimated_minutes > request.max_minutes) return { status: "error", code: "invalid-ai-response" };
    if (recipe.servings !== request.servings) return { status: "error", code: "invalid-ai-response" };

    const ingredientIds = new Set<string>();

    for (const ingredient of recipe.ingredients) {
      if (ingredientIds.has(ingredient.inventory_item_id)) return { status: "error", code: "invalid-ai-response" };
      ingredientIds.add(ingredient.inventory_item_id);

      const inventoryItem = inventoryById.get(ingredient.inventory_item_id);
      if (!inventoryItem) return { status: "error", code: "invalid-ai-response" };
      if (ingredient.name !== inventoryItem.name) return { status: "error", code: "invalid-ai-response" };
      if (ingredient.unit !== inventoryItem.unit) return { status: "error", code: "invalid-ai-response" };
      if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) return { status: "error", code: "invalid-ai-response" };
      if (ingredient.quantity > inventoryItem.quantity) return { status: "error", code: "invalid-ai-response" };
    }
  }

  if (request.priority_mode === "expiration" && urgentInventoryItemIds.size > 0) {
    if (!hasRecipeAiUrgencyCoverage(parsed.data.recipes, urgentInventoryItemIds)) {
      return { status: "error", code: "invalid-ai-response" };
    }

    if (request.suggestion_count === 1 && !hasRecipeAiUrgencyCoverage([parsed.data.recipes[0]], urgentInventoryItemIds)) {
      return { status: "error", code: "invalid-ai-response" };
    }
  }

  return { status: "success", recipes: parsed.data.recipes };
}
