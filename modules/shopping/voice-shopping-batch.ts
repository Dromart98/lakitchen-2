import { z } from "zod";

export const VOICE_SHOPPING_BATCH_MAX_LENGTH = 4000;
export const VOICE_SHOPPING_BATCH_MAX_ITEMS = 30;
export const VOICE_SHOPPING_BATCH_UNITS = ["ud", "g", "kg", "ml", "l"] as const;
export const VOICE_SHOPPING_BATCH_ISSUES = ["quantity-missing", "unit-missing", "package-size-missing", "ambiguous-product", "low-confidence"] as const;
export type VoiceShoppingDraftIssue = (typeof VOICE_SHOPPING_BATCH_ISSUES)[number];
const finiteNonNegative = z.number().finite().min(0);
export const VoiceShoppingDraftItemSchema = z.object({
  name: z.string().trim().min(1).max(120), quantity: finiteNonNegative.nullable(), unit: z.enum(VOICE_SHOPPING_BATCH_UNITS).nullable(),
  confidence: z.enum(["high", "medium", "low"]), issues: z.array(z.enum(VOICE_SHOPPING_BATCH_ISSUES)).max(5),
}).strict();
export const VoiceShoppingBatchOutputSchema = z.object({ items: z.array(VoiceShoppingDraftItemSchema).min(1).max(VOICE_SHOPPING_BATCH_MAX_ITEMS) }).strict();
export type VoiceShoppingDraftItem = z.infer<typeof VoiceShoppingDraftItemSchema> & { client_id: string };
export type VoiceShoppingBatchResult =
 | { status: "success"; items: VoiceShoppingDraftItem[] }
 | { status: "needs-clarification"; items: VoiceShoppingDraftItem[]; message: string }
 | { status: "error"; code: "invalid-input" | "too-many-products" | "not-configured" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response"; message: string };
export function parseVoiceShoppingBatchInput(text: string) { const value = text.trim(); return value && value.length <= VOICE_SHOPPING_BATCH_MAX_LENGTH ? value : null; }
export function normalizeVoiceShoppingDraftItem(item: z.infer<typeof VoiceShoppingDraftItemSchema>) {
 const issues = new Set(item.issues); const name = item.name.trim();
 for (const [issue, needed] of [["quantity-missing", item.quantity === null || item.quantity <= 0], ["unit-missing", item.unit === null], ["low-confidence", item.confidence === "low"]] as const) needed ? issues.add(issue) : issues.delete(issue);
 if (item.quantity !== null && item.quantity > 0 && item.unit !== null) issues.delete("package-size-missing");
 return { ...item, name, issues: [...issues] };
}
export function normalizeEditedVoiceShoppingDraftItem(item: VoiceShoppingDraftItem, field: "name" | "quantity" | "unit", value: unknown): VoiceShoppingDraftItem {
 const next = { ...item, [field]: value } as z.infer<typeof VoiceShoppingDraftItemSchema>;
 if (field === "name" && typeof value === "string" && value.trim()) next.issues = next.issues.filter((issue) => issue !== "ambiguous-product");
 return { ...normalizeVoiceShoppingDraftItem(next), client_id: item.client_id };
}
export function withShoppingDraftClientIds(items: z.infer<typeof VoiceShoppingDraftItemSchema>[]) { return items.map((item, index) => ({ ...normalizeVoiceShoppingDraftItem(item), client_id: `shopping-draft-${Date.now().toString(36)}-${index}` })); }
export function getVoiceShoppingDraftStatus(item: VoiceShoppingDraftItem) {
 const normalized = normalizeVoiceShoppingDraftItem(item);
 if (!normalized.name || normalized.quantity === null || normalized.quantity <= 0 || normalized.unit === null || normalized.issues.includes("package-size-missing")) return "Incompleto";
 return normalized.issues.length ? "Necesita revisión" : "Listo";
}
