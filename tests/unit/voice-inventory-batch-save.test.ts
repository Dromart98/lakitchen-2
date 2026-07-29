import { describe, expect, it } from "vitest";
import { buildVoiceInventoryBatchCatalogMetadata, buildVoiceInventoryBatchSaveItems, toVoiceInventoryBatchSaveInput } from "@/modules/inventory/voice-inventory-batch-save";
import type { VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";
const item = { name: " Pollo ", quantity: 2, unit: "kg", location: "freezer", category: "protein", nutrition_basis: "per_100g", calories: 120, protein_g: 22, carbs_g: 0, fat_g: 3 };
describe("voice batch save schema", () => {
 it("accepts compatible strict inventory items", () => expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [item]).success).toBe(true));
 it("accepts a null category without weakening category validation", () => { expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [{ ...item, category: null }]).success).toBe(true); expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [{ ...item, category: "unknown" }]).success).toBe(false); });
 it("rejects empty, too-large, invalid and extra payloads", () => { expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", []).success).toBe(false); expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", Array.from({ length: 31 }, () => item)).success).toBe(false); for (const changed of [{ quantity: 0 }, { quantity: -1 }, { name: "" }, { name: "x".repeat(121) }, { unit: "box" }, { location: "garage" }, { category: "nope" }, { calories: -1 }, { nutrition_basis: "per_unit" }, { client_id: "x" }, { expires_at: "2026-01-01" }, { user_id: "x" }]) expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [{ ...item, ...changed }]).success).toBe(false); });
 it("rejects non-finite numbers", () => { for (const value of [NaN, Infinity, -Infinity]) expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [{ ...item, calories: value }]).success).toBe(false); });
 it("requires mapping real editable drafts before strict save validation", () => { const draft = { ...item, client_id: "draft", food_state: "raw" as const, package_measure_kind: null, package_count: null, package_size: null, package_size_unit: null, total_size: null, total_size_unit: null, confidence: "low" as const, issues: ["low-confidence"], review_acknowledged: true }; expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [draft]).success).toBe(false); const mapped = buildVoiceInventoryBatchSaveItems([draft as any]); expect(mapped.success).toBe(true); if (mapped.success) expect(Object.keys(mapped.data[0])).toEqual(["name", "quantity", "unit", "location", "category", "nutrition_basis", "calories", "protein_g", "carbs_g", "fat_g"]); });
 it("keeps reviewed food state outside the exact RPC payload", () => { const draft = { ...item, client_id: "rice", name: "Arroz", food_state: "raw" as const, package_measure_kind: null, package_count: null, package_size: null, package_size_unit: null, total_size: null, total_size_unit: null, confidence: "medium" as const, nutrition_assumptions: "Revisado", issues: [] }; const rpc = buildVoiceInventoryBatchSaveItems([draft as any]); const metadata = buildVoiceInventoryBatchCatalogMetadata([draft as any]); expect(rpc.success && Object.keys(rpc.data[0])).not.toContain("food_state"); expect(metadata).toMatchObject({ success: true, data: [{ name: "Arroz", food_state: "raw", package_measure_kind: null, package_count: null, package_size: null, package_size_unit: null, total_size: null, total_size_unit: null }] }); });
 it("blocks an incomplete draft and accepts it after the missing quantity and unit are corrected", () => {
   const incomplete = { ...item, quantity: null, unit: null, nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, client_id: "salt", food_state: "not_applicable" as const, confidence: "low" as const, nutrition_assumptions: "Falta indicar la cantidad.", issues: ["quantity-missing", "unit-missing", "nutrition-incomplete"] };
   expect(buildVoiceInventoryBatchSaveItems([incomplete as unknown as VoiceInventoryDraftItem]).success).toBe(false);
   const corrected = { ...incomplete, quantity: 100, unit: "g", nutrition_basis: "per_100g", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, issues: [] };
   expect(buildVoiceInventoryBatchSaveItems([corrected as unknown as VoiceInventoryDraftItem]).success).toBe(true);
 });
});

describe("voice inventory catalog identity payload", () => {
  const legacy = { name: "Arroz", quantity: 1, unit: "kg", location: "pantry", category: null, nutrition_basis: "per_100g", calories: 360, protein_g: 7, carbs_g: 80, fat_g: 1 };
  it("accepts both legacy items and optional valid identity metadata", () => {
    const submissionId = "123e4567-e89b-42d3-a456-426614174000";
    expect(toVoiceInventoryBatchSaveInput(submissionId, [legacy]).success).toBe(true);
    expect(toVoiceInventoryBatchSaveInput(submissionId, [{ ...legacy, food_catalog_item_id: "223e4567-e89b-42d3-a456-426614174000" }]).success).toBe(true);
    expect(toVoiceInventoryBatchSaveInput(submissionId, [{ ...legacy, food_catalog_item_id: "not-a-uuid" }]).success).toBe(false);
  });
});
