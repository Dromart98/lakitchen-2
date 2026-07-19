import { z } from "zod";
import { INVENTORY_CATEGORIES, type InventoryCategory } from "@/modules/inventory/inventory-categories";

export const VOICE_INVENTORY_BATCH_MAX_LENGTH = 4000;
export const VOICE_INVENTORY_BATCH_MAX_ITEMS = 30;
export const VOICE_INVENTORY_BATCH_UNITS = ["g", "kg", "ml", "l", "ud"] as const;
export const VOICE_INVENTORY_BATCH_LOCATIONS = ["pantry", "fridge", "freezer"] as const;
export const VOICE_INVENTORY_BATCH_ISSUES = ["quantity-missing", "unit-missing", "location-unconfirmed", "package-size-missing", "nutrition-incomplete", "low-confidence", "ambiguous-product"] as const;

const finiteNonNegative = z.number().finite().min(0);
export const VoiceInventoryDraftItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: finiteNonNegative.nullable(),
  unit: z.enum(VOICE_INVENTORY_BATCH_UNITS).nullable(),
  location: z.enum(VOICE_INVENTORY_BATCH_LOCATIONS).nullable(),
  category: z.enum(INVENTORY_CATEGORIES).nullable(),
  food_state: z.enum(["raw", "cooked", "processed", "unknown"]),
  nutrition_basis: z.enum(["per_100g", "per_100ml", "per_unit"]).nullable(),
  calories: finiteNonNegative.nullable(),
  protein_g: finiteNonNegative.nullable(),
  carbs_g: finiteNonNegative.nullable(),
  fat_g: finiteNonNegative.nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  issues: z.array(z.enum(VOICE_INVENTORY_BATCH_ISSUES)).max(7),
}).strict().superRefine((item, ctx) => {
  const nutrition = [item.calories, item.protein_g, item.carbs_g, item.fat_g];
  if (nutrition.some((value) => value !== null) && (!item.nutrition_basis || nutrition.some((value) => value === null))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete nutrition" });
  }
});
export const VoiceInventoryBatchOutputSchema = z.object({ items: z.array(VoiceInventoryDraftItemSchema).min(1).max(VOICE_INVENTORY_BATCH_MAX_ITEMS) }).strict();
export type VoiceInventoryDraftItem = z.infer<typeof VoiceInventoryDraftItemSchema> & { client_id: string };
export type VoiceInventoryDraftIssue = (typeof VOICE_INVENTORY_BATCH_ISSUES)[number];
export type VoiceInventoryBatchResult =
 | { status: "success"; items: VoiceInventoryDraftItem[] }
 | { status: "needs-clarification"; items: VoiceInventoryDraftItem[]; message: string }
 | { status: "error"; code: "invalid-input" | "too-many-products" | "not-configured" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response"; message: string };

export function parseVoiceInventoryBatchInput(text: string) {
  const normalized = text.trim();
  return normalized.length > 0 && normalized.length <= VOICE_INVENTORY_BATCH_MAX_LENGTH ? normalized : null;
}
export function withDraftClientIds(items: z.infer<typeof VoiceInventoryDraftItemSchema>[]): VoiceInventoryDraftItem[] {
  return items.map((item, index) => ({ ...item, client_id: `voice-draft-${Date.now().toString(36)}-${index}` }));
}
export function getVoiceInventoryDraftStatus(item: VoiceInventoryDraftItem) {
  if (item.issues.includes("quantity-missing") || item.issues.includes("unit-missing") || item.issues.includes("package-size-missing") || item.issues.includes("nutrition-incomplete")) return "Incompleto";
  return item.issues.length ? "Necesita revisión" : "Listo";
}
export type { InventoryCategory };
