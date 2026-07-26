import { z } from "zod";

import { INVENTORY_CATEGORIES } from "@/modules/inventory/inventory-categories";

export const VOICE_INVENTORY_BATCH_MAX_LENGTH = 4000;
export const VOICE_INVENTORY_BATCH_MAX_ITEMS = 30;
export const VOICE_INVENTORY_BATCH_UNITS = ["g", "kg", "ml", "l", "ud"] as const;
export const VOICE_INVENTORY_BATCH_LOCATIONS = ["pantry", "fridge", "freezer"] as const;
export const VOICE_INVENTORY_BATCH_ISSUES = [
  "quantity-missing", "unit-missing", "location-unconfirmed",
  "package-size-missing", "nutrition-incomplete", "nutrition-basis-mismatch",
  "low-confidence", "ambiguous-product",
] as const;
export type VoiceInventoryDraftIssue = (typeof VOICE_INVENTORY_BATCH_ISSUES)[number];

const finiteNonNegative = z.number().finite().min(0);
export const VoiceInventoryDraftItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: finiteNonNegative.nullable(),
  unit: z.enum(VOICE_INVENTORY_BATCH_UNITS).nullable(),
  location: z.enum(VOICE_INVENTORY_BATCH_LOCATIONS).nullable(),
  category: z.enum(INVENTORY_CATEGORIES).nullable(),
  food_state: z.enum(["raw", "cooked", "processed", "not_applicable", "unknown"]),
  nutrition_basis: z.enum(["per_100g", "per_100ml", "per_unit"]).nullable(),
  calories: finiteNonNegative.nullable(), protein_g: finiteNonNegative.nullable(),
  carbs_g: finiteNonNegative.nullable(), fat_g: finiteNonNegative.nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  nutrition_assumptions: z.string().max(500),
  issues: z.array(z.enum(VOICE_INVENTORY_BATCH_ISSUES)).max(9),
}).strict();
export const VoiceInventoryBatchOutputSchema = z.object({ items: z.array(VoiceInventoryDraftItemSchema).min(1).max(VOICE_INVENTORY_BATCH_MAX_ITEMS) }).strict();
export type VoiceInventoryDraftItem = z.infer<typeof VoiceInventoryDraftItemSchema> & { client_id: string; review_acknowledged?: boolean };
export type VoiceInventoryBatchResult =
 | { status: "success"; items: VoiceInventoryDraftItem[] }
 | { status: "needs-clarification"; items: VoiceInventoryDraftItem[]; message: string }
 | { status: "error"; code: "invalid-input" | "too-many-products" | "not-configured" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response"; message: string };

export function parseVoiceInventoryBatchInput(text: string) { const value = text.trim(); return value && value.length <= VOICE_INVENTORY_BATCH_MAX_LENGTH ? value : null; }
function nutritionComplete(item: z.infer<typeof VoiceInventoryDraftItemSchema>) { return Boolean(item.nutrition_basis) && [item.calories, item.protein_g, item.carbs_g, item.fat_g].every((value) => value !== null); }
function nutritionBasisMatches(item: z.infer<typeof VoiceInventoryDraftItemSchema>) {
  if (!item.unit || !item.nutrition_basis) return false;
  return (["g", "kg"].includes(item.unit) && item.nutrition_basis === "per_100g") || (["ml", "l"].includes(item.unit) && item.nutrition_basis === "per_100ml") || (item.unit === "ud" && item.nutrition_basis === "per_unit");
}
function packageResolved(item: z.infer<typeof VoiceInventoryDraftItemSchema>) { return item.quantity !== null && item.quantity > 0 && item.unit !== null && nutritionComplete(item); }
export function normalizeVoiceInventoryDraftItem(item: z.infer<typeof VoiceInventoryDraftItemSchema>) {
 const issues = new Set(item.issues);
 const derived: Array<[VoiceInventoryDraftIssue, boolean]> = [["quantity-missing", item.quantity === null || item.quantity <= 0], ["unit-missing", item.unit === null], ["location-unconfirmed", item.location === null], ["nutrition-incomplete", !nutritionComplete(item)], ["nutrition-basis-mismatch", Boolean(item.unit && item.nutrition_basis && !nutritionBasisMatches(item))], ["low-confidence", item.confidence === "low"]];
 for (const [issue, needed] of derived) { if (needed) issues.add(issue); else issues.delete(issue); }
 if (packageResolved(item)) issues.delete("package-size-missing");
 return { ...item, issues: [...issues] };
}
export function normalizeEditedVoiceInventoryDraftItem(item: VoiceInventoryDraftItem, field: keyof VoiceInventoryDraftItem, value: unknown): VoiceInventoryDraftItem {
 const next = { ...item, [field]: value, review_acknowledged: field === "review_acknowledged" ? Boolean(value) : false };
 if (field === "name" && typeof value === "string" && value.trim()) next.issues = next.issues.filter((issue) => issue !== "ambiguous-product");
 return { ...normalizeVoiceInventoryDraftItem(next), client_id: item.client_id };
}
export function withDraftClientIds(items: z.infer<typeof VoiceInventoryDraftItemSchema>[]) { return items.map((item, index) => ({ ...normalizeVoiceInventoryDraftItem(item), client_id: `voice-draft-${Date.now().toString(36)}-${index}` })); }
const structuralIssues: VoiceInventoryDraftIssue[] = ["quantity-missing", "unit-missing", "location-unconfirmed", "package-size-missing", "nutrition-incomplete", "nutrition-basis-mismatch", "ambiguous-product"];
export function getVoiceInventoryDraftReadiness(item: VoiceInventoryDraftItem) { const normalized = normalizeVoiceInventoryDraftItem(item); const structuralReady = normalized.name.trim().length > 0 && !normalized.issues.some((issue) => structuralIssues.includes(issue)); const requiresReview = normalized.issues.some((issue) => !structuralIssues.includes(issue)); return { structuralReady, requiresReview, reviewReady: !requiresReview || Boolean(item.review_acknowledged), saveReady: structuralReady && (!requiresReview || Boolean(item.review_acknowledged)) }; }
export function getVoiceInventoryDraftStatus(item: VoiceInventoryDraftItem) { const readiness = getVoiceInventoryDraftReadiness(item); return !readiness.structuralReady ? "Incompleto" : !readiness.reviewReady ? "Necesita revisión" : "Listo"; }
