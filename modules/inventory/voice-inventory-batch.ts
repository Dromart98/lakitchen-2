import { z } from "zod";

import { INVENTORY_CATEGORIES } from "@/modules/inventory/inventory-categories";

export const VOICE_INVENTORY_BATCH_MAX_LENGTH = 4000;
export const VOICE_INVENTORY_BATCH_MAX_ITEMS = 30;
export const VOICE_INVENTORY_BATCH_UNITS = ["g", "kg", "ml", "l", "ud"] as const;
export const VOICE_INVENTORY_BATCH_LOCATIONS = ["pantry", "fridge", "freezer"] as const;
export const VOICE_INVENTORY_BATCH_ISSUES = [
  "quantity-missing", "unit-missing", "location-unconfirmed", "package-size-missing",
  "nutrition-incomplete", "low-confidence", "ambiguous-product",
] as const;
export type VoiceInventoryDraftIssue = (typeof VOICE_INVENTORY_BATCH_ISSUES)[number];

const finiteNonNegative = z.number().finite().min(0);
export const VoiceInventoryDraftItemSchema = z.object({
  name: z.string().trim().min(1).max(120), quantity: finiteNonNegative.nullable(),
  unit: z.enum(VOICE_INVENTORY_BATCH_UNITS).nullable(), location: z.enum(VOICE_INVENTORY_BATCH_LOCATIONS).nullable(),
  category: z.enum(INVENTORY_CATEGORIES).nullable(), food_state: z.enum(["raw", "cooked", "processed", "unknown"]),
  nutrition_basis: z.enum(["per_100g", "per_100ml", "per_unit"]).nullable(), calories: finiteNonNegative.nullable(),
  protein_g: finiteNonNegative.nullable(), carbs_g: finiteNonNegative.nullable(), fat_g: finiteNonNegative.nullable(),
  confidence: z.enum(["high", "medium", "low"]), issues: z.array(z.enum(VOICE_INVENTORY_BATCH_ISSUES)).max(7),
}).strict();
export const VoiceInventoryBatchOutputSchema = z.object({ items: z.array(VoiceInventoryDraftItemSchema).min(1).max(VOICE_INVENTORY_BATCH_MAX_ITEMS) }).strict();
export type VoiceInventoryDraftItem = z.infer<typeof VoiceInventoryDraftItemSchema> & { client_id: string };
export type VoiceInventoryBatchResult =
 | { status: "success"; items: VoiceInventoryDraftItem[] }
 | { status: "needs-clarification"; items: VoiceInventoryDraftItem[]; message: string }
 | { status: "error"; code: "invalid-input" | "too-many-products" | "not-configured" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response"; message: string };

export function parseVoiceInventoryBatchInput(text: string) { const value = text.trim(); return value && value.length <= VOICE_INVENTORY_BATCH_MAX_LENGTH ? value : null; }
function nutritionComplete(item: z.infer<typeof VoiceInventoryDraftItemSchema>) { return Boolean(item.nutrition_basis) && [item.calories, item.protein_g, item.carbs_g, item.fat_g].every((value) => value !== null); }
function packageResolved(item: z.infer<typeof VoiceInventoryDraftItemSchema>) { return item.quantity !== null && item.unit !== null && nutritionComplete(item); }
/** Reconciles AI hints with facts; mandatory issues always reflect current fields. */
export function normalizeVoiceInventoryDraftItem(item: z.infer<typeof VoiceInventoryDraftItemSchema>): z.infer<typeof VoiceInventoryDraftItemSchema> {
 const issues = new Set(item.issues);
 const derived: Array<[VoiceInventoryDraftIssue, boolean]> = [["quantity-missing", item.quantity === null], ["unit-missing", item.unit === null], ["location-unconfirmed", item.location === null], ["nutrition-incomplete", !nutritionComplete(item)], ["low-confidence", item.confidence === "low"]];
 for (const [issue, needed] of derived) { if (needed) issues.add(issue); else issues.delete(issue); }
 if (packageResolved(item)) issues.delete("package-size-missing");
 return { ...item, issues: [...issues] };
}
export function normalizeEditedVoiceInventoryDraftItem(item: VoiceInventoryDraftItem, field: keyof VoiceInventoryDraftItem, value: unknown): VoiceInventoryDraftItem {
 const next = { ...item, [field]: value }; if (field === "name" && typeof value === "string" && value.trim()) next.issues = next.issues.filter((issue) => issue !== "ambiguous-product"); return { ...normalizeVoiceInventoryDraftItem(next), client_id: item.client_id };
}
export function withDraftClientIds(items: z.infer<typeof VoiceInventoryDraftItemSchema>[]) { return items.map((item, index) => ({ ...normalizeVoiceInventoryDraftItem(item), client_id: `voice-draft-${Date.now().toString(36)}-${index}` })); }
export function getVoiceInventoryDraftStatus(item: VoiceInventoryDraftItem) { const normalized = normalizeVoiceInventoryDraftItem(item); if (!normalized.name.trim() || normalized.issues.some((issue) => ["quantity-missing", "unit-missing", "nutrition-incomplete", "package-size-missing"].includes(issue))) return "Incompleto"; return normalized.issues.length ? "Necesita revisión" : "Listo"; }
