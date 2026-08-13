import { z } from "zod";

export type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type TextMealEstimatedIngredient = { normalized_name: string; display_name: string; name: string; quantity: number; unit: string; preparation: string | null; confidence: "high" | "medium" | "low"; calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type TextMealEstimationErrorCode = "invalid-input" | "invalid-photo" | "unsupported-photo" | "photo-too-large" | "photo-processing-failed" | "unauthenticated" | "missing-api-key" | "ai-burst-limit" | "daily-ai-limit" | "ai-access-unavailable" | "ai-feature-disabled" | "provider-timeout" | "provider-error" | "invalid-ai-response" | "unexpected-error";
export type TextMealEstimationResult =
  | { status: "success"; suggested_name: string; ingredients: TextMealEstimatedIngredient[]; total: MacroTotals; assumptions: string[]; confidence: "high" | "medium" | "low" }
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: TextMealEstimationErrorCode };

export const textMealRequestSchema = z.object({ description: z.string().trim().min(3).max(2000) }).strict();

const recognizedUnits = ["g", "ml", "unidad", "unidades", "loncha", "lonchas", "cucharadita", "cucharaditas", "cucharada", "cucharadas", "taza", "tazas", "lata", "latas", "plato", "platos"] as const;
const ingredientSchema = z.object({
  normalized_name: z.string().trim().min(1).max(120), display_name: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(120), quantity: z.number().finite().positive().max(10000), unit: z.enum(recognizedUnits), preparation: z.string().trim().min(1).max(120).nullable(), confidence: z.enum(["high", "medium", "low"]),
  calories: z.number().finite().min(0).max(5000), protein_g: z.number().finite().min(0).max(500), carbs_g: z.number().finite().min(0).max(1000), fat_g: z.number().finite().min(0).max(500),
}).strict();
const assumptionsSchema = z.array(z.string().trim().min(1).max(300)).max(20);
const macroTotalsSchema = z.object({
  calories: z.number().finite().min(0).max(10000), protein_g: z.number().finite().min(0).max(10000), carbs_g: z.number().finite().min(0).max(10000), fat_g: z.number().finite().min(0).max(10000),
}).strict();

// This is the exact raw response required by the strict Structured Outputs schema.
export const textMealRawProviderSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), suggested_name: z.string().trim().min(1).max(120), ingredients: z.array(ingredientSchema).min(1).max(20), assumptions: assumptionsSchema, confidence: z.enum(["high", "medium", "low"]), message: z.null() }).strict(),
  z.object({ status: z.literal("needs-clarification"), suggested_name: z.null(), ingredients: z.null(), assumptions: z.null(), confidence: z.null(), message: z.string().trim().min(12).max(500) }).strict(),
]);

export const TEXT_MEAL_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["status", "suggested_name", "ingredients", "assumptions", "confidence", "message"], properties: { status: { type: "string", enum: ["success", "needs-clarification"] }, suggested_name: { type: ["string", "null"] }, ingredients: { type: ["array", "null"], minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["normalized_name", "display_name", "name", "quantity", "unit", "preparation", "confidence", "calories", "protein_g", "carbs_g", "fat_g"], properties: { normalized_name: { type: "string" }, display_name: { type: "string" }, name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: recognizedUnits }, preparation: { type: ["string", "null"] }, confidence: { type: "string", enum: ["high", "medium", "low"] }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" } } } }, assumptions: { type: ["array", "null"], items: { type: "string" } }, confidence: { type: ["string", "null"], enum: ["high", "medium", "low", null] }, message: { type: ["string", "null"] } } } as const;

const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
export function calculateTextMealTotals(ingredients: TextMealEstimatedIngredient[]): MacroTotals | null {
  const total = ingredients.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein_g: sum.protein_g + item.protein_g, carbs_g: sum.carbs_g + item.carbs_g, fat_g: sum.fat_g + item.fat_g }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  return total.calories > 10000 ? null : { calories: round(total.calories), protein_g: round(total.protein_g), carbs_g: round(total.carbs_g), fat_g: round(total.fat_g) };
}
export function validateTextMealProviderOutput(value: unknown): TextMealEstimationResult {
  const parsed = textMealRawProviderSchema.safeParse(value);
  if (!parsed.success) return { status: "error", code: "invalid-ai-response" };
  if (parsed.data.status === "needs-clarification") return { status: "needs-clarification", message: parsed.data.message };
  const total = calculateTextMealTotals(parsed.data.ingredients);
  if (!total) return { status: "error", code: "invalid-ai-response" };
  return { status: "success", suggested_name: parsed.data.suggested_name, ingredients: parsed.data.ingredients, total, assumptions: parsed.data.assumptions, confidence: parsed.data.confidence };
}

export function validateCachedTextMealSuccess(value: unknown): Extract<TextMealEstimationResult, { status: "success" }> | null {
  const parsed = z.object({
    status: z.literal("success"), suggested_name: z.string().trim().min(1).max(120), ingredients: z.array(ingredientSchema).min(1).max(20), total: macroTotalsSchema, assumptions: assumptionsSchema, confidence: z.enum(["high", "medium", "low"]),
  }).strict().safeParse(value);
  if (!parsed.success) return null;
  const total = calculateTextMealTotals(parsed.data.ingredients);
  if (!total || JSON.stringify(total) !== JSON.stringify(parsed.data.total)) return null;
  return parsed.data;
}
