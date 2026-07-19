import { describe, expect, it } from "vitest";
import { toVoiceInventoryBatchSaveInput } from "@/modules/inventory/voice-inventory-batch-save";
const item = { name: " Pollo ", quantity: 2, unit: "kg", location: "freezer", category: "protein", nutrition_basis: "per_100g", calories: 120, protein_g: 22, carbs_g: 0, fat_g: 3 };
describe("voice batch save schema", () => {
 it("accepts compatible strict inventory items", () => expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [item]).success).toBe(true));
 it("rejects empty, too-large, invalid and extra payloads", () => { expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", []).success).toBe(false); expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", Array.from({ length: 31 }, () => item)).success).toBe(false); for (const changed of [{ quantity: 0 }, { quantity: -1 }, { name: "" }, { name: "x".repeat(121) }, { unit: "box" }, { location: "garage" }, { category: "nope" }, { calories: -1 }, { nutrition_basis: "per_unit" }, { client_id: "x" }, { expires_at: "2026-01-01" }, { user_id: "x" }]) expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [{ ...item, ...changed }]).success).toBe(false); });
 it("rejects non-finite numbers", () => { for (const value of [NaN, Infinity, -Infinity]) expect(toVoiceInventoryBatchSaveInput("123e4567-e89b-42d3-a456-426614174000", [{ ...item, calories: value }]).success).toBe(false); });
});
