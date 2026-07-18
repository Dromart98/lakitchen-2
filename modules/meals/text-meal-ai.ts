import { z } from "zod";

export type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type TextMealEstimatedIngredient = { name: string; quantity: number; unit: string; preparation: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type TextMealEstimationErrorCode = "invalid-input" | "unauthenticated" | "missing-api-key" | "provider-timeout" | "provider-error" | "invalid-ai-response" | "unexpected-error";
export type TextMealEstimationResult =
 | { status: "success"; suggested_name: string; ingredients: TextMealEstimatedIngredient[]; total: MacroTotals; assumptions: string[]; confidence: "high" | "medium" | "low" }
 | { status: "needs-clarification"; message: string }
 | { status: "error"; code: TextMealEstimationErrorCode };

export const textMealRequestSchema = z.object({ description: z.string().trim().min(3).max(2000) }).strict();
const ingredientSchema = z.object({ name: z.string().trim().min(1).max(120), quantity: z.number().finite().positive().max(10000), unit: z.string().trim().min(1).max(40), preparation: z.string().trim().min(1).max(120).nullable(), calories: z.number().finite().min(0).max(5000), protein_g: z.number().finite().min(0).max(500), carbs_g: z.number().finite().min(0).max(1000), fat_g: z.number().finite().min(0).max(500) }).strict();
const providerSchema = z.discriminatedUnion("status", [
 z.object({ status: z.literal("success"), suggested_name: z.string().trim().min(1).max(120), ingredients: z.array(ingredientSchema).min(1).max(20), assumptions: z.array(z.string().trim().min(1).max(300)).max(20), confidence: z.enum(["high", "medium", "low"]) }).strict(),
 z.object({ status: z.literal("needs-clarification"), message: z.string().trim().min(12).max(500) }).strict(),
]);

export const TEXT_MEAL_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["status", "suggested_name", "ingredients", "assumptions", "confidence", "message"], properties: { status: { type: "string", enum: ["success", "needs-clarification"] }, suggested_name: { type: ["string", "null"] }, ingredients: { type: ["array", "null"], minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["name", "quantity", "unit", "preparation", "calories", "protein_g", "carbs_g", "fat_g"], properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, preparation: { type: ["string", "null"] }, calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" } } } }, assumptions: { type: ["array", "null"], items: { type: "string" } }, confidence: { type: ["string", "null"], enum: ["high", "medium", "low", null] }, message: { type: ["string", "null"] } } } as const;

const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
export function calculateTextMealTotals(ingredients: TextMealEstimatedIngredient[]): MacroTotals | null { const total = ingredients.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein_g: sum.protein_g + item.protein_g, carbs_g: sum.carbs_g + item.carbs_g, fat_g: sum.fat_g + item.fat_g }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }); return total.calories > 10000 ? null : { calories: round(total.calories), protein_g: round(total.protein_g), carbs_g: round(total.carbs_g), fat_g: round(total.fat_g) }; }
export function validateTextMealProviderOutput(value: unknown): TextMealEstimationResult { const parsed = providerSchema.safeParse(value); if (!parsed.success) return { status: "error", code: "invalid-ai-response" }; if (parsed.data.status === "needs-clarification") return parsed.data; const total = calculateTextMealTotals(parsed.data.ingredients); if (!total) return { status: "error", code: "invalid-ai-response" }; return { ...parsed.data, total }; }
