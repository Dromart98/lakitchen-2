import { z } from "zod";

import { INVENTORY_CATEGORIES } from "@/modules/inventory/inventory-categories";
import { PACKAGE_SIZE_UNITS, convertNutritionToPerUnit, resolvePackageQuantity } from "@/modules/inventory/inventory-package-quantities";

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
  package_count: finiteNonNegative.nullable(),
  package_size: finiteNonNegative.nullable(),
  package_size_unit: z.enum(PACKAGE_SIZE_UNITS).nullable(),
  total_size: finiteNonNegative.nullable(),
  total_size_unit: z.enum(PACKAGE_SIZE_UNITS).nullable(),
  source_nutrition_basis: z.enum(["per_100g", "per_100ml"]).optional(),
  source_calories: finiteNonNegative.nullable().optional(),
  source_protein_g: finiteNonNegative.nullable().optional(),
  source_carbs_g: finiteNonNegative.nullable().optional(),
  source_fat_g: finiteNonNegative.nullable().optional(),
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
export function normalizeVoiceInventoryDraftItem(item: z.infer<typeof VoiceInventoryDraftItemSchema>) {
 const resolved = resolvePackageQuantity(item);
 const sourceBasis = item.source_nutrition_basis ?? (item.nutrition_basis === "per_100g" || item.nutrition_basis === "per_100ml" ? item.nutrition_basis : undefined);
 const sourceNutrition = item.source_nutrition_basis ? {
   calories: item.source_calories ?? null, protein_g: item.source_protein_g ?? null,
   carbs_g: item.source_carbs_g ?? null, fat_g: item.source_fat_g ?? null,
 } : item;
 const converted = resolved && sourceBasis
   ? convertNutritionToPerUnit(sourceNutrition, sourceBasis, resolved)
   : null;
 const normalizedItem = resolved ? {
   ...item,
   quantity: resolved.package_count,
   unit: "ud" as const,
   ...(converted ? {
     ...converted, nutrition_basis: "per_unit" as const,
     source_nutrition_basis: sourceBasis,
     source_calories: sourceNutrition.calories, source_protein_g: sourceNutrition.protein_g,
     source_carbs_g: sourceNutrition.carbs_g, source_fat_g: sourceNutrition.fat_g,
   } : {}),
 } : item;
 const issues = new Set(normalizedItem.issues);
 const derived: Array<[VoiceInventoryDraftIssue, boolean]> = [["quantity-missing", normalizedItem.quantity === null || normalizedItem.quantity <= 0], ["unit-missing", normalizedItem.unit === null], ["location-unconfirmed", normalizedItem.location === null], ["nutrition-incomplete", !nutritionComplete(normalizedItem)], ["nutrition-basis-mismatch", Boolean(normalizedItem.unit && normalizedItem.nutrition_basis && !nutritionBasisMatches(normalizedItem))], ["low-confidence", normalizedItem.confidence === "low"]];
 for (const [issue, needed] of derived) { if (needed) issues.add(issue); else issues.delete(issue); }
 if (resolved) issues.delete("package-size-missing");
 return { ...normalizedItem, issues: [...issues] };
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
