import { describe, expect, it } from "vitest";

import {
  VoiceShoppingBatchOutputSchema,
  getVoiceShoppingDraftReadiness,
  getVoiceShoppingDraftStatus,
  normalizeEditedVoiceShoppingDraftItem,
  normalizeVoiceShoppingDraftItem,
  parseVoiceShoppingBatchInput,
} from "@/modules/shopping/voice-shopping-batch";

describe("voice shopping batch domain", () => {
  it("validates text bounds and strict AI drafts", () => {
    expect(parseVoiceShoppingBatchInput(" ")).toBeNull();
    expect(parseVoiceShoppingBatchInput("a".repeat(4000))).toBeTruthy();
    expect(parseVoiceShoppingBatchInput("a".repeat(4001))).toBeNull();
    expect(VoiceShoppingBatchOutputSchema.safeParse({ items: [{ name: "Leche", quantity: 1, unit: "l", confidence: "high", issues: [] }] }).success).toBe(true);
    expect(VoiceShoppingBatchOutputSchema.safeParse({ items: Array.from({ length: 31 }, () => ({ name: "x", quantity: 1, unit: "ud", confidence: "high", issues: [] })) }).success).toBe(false);
  });

  it("blocks structural issues and requires acknowledgement only for reviewable warnings", () => {
    const incomplete = normalizeVoiceShoppingDraftItem({ name: "Leche", quantity: 0, unit: null, confidence: "low", issues: [] });
    expect(incomplete.issues).toEqual(expect.arrayContaining(["quantity-missing", "unit-missing", "low-confidence"]));
    expect(getVoiceShoppingDraftStatus({ ...incomplete, client_id: "local" })).toBe("Incompleto");
    expect(getVoiceShoppingDraftReadiness({ ...incomplete, client_id: "local", review_acknowledged: true }).saveReady).toBe(false);

    const warning = { name: "Leche", quantity: 1, unit: "l" as const, confidence: "low" as const, issues: ["low-confidence"] as const, client_id: "local" };
    expect(getVoiceShoppingDraftReadiness(warning).saveReady).toBe(false);
    expect(getVoiceShoppingDraftReadiness({ ...warning, review_acknowledged: true }).saveReady).toBe(true);
  });

  it("clears acknowledgement after a relevant edit and resolves ambiguity by editing the name", () => {
    const ambiguous = { name: "algo", quantity: 1, unit: "ud" as const, confidence: "high" as const, issues: ["ambiguous-product"] as const, client_id: "local", review_acknowledged: true };
    const renamed = normalizeEditedVoiceShoppingDraftItem(ambiguous, "name", "Pan integral");
    expect(renamed.issues).not.toContain("ambiguous-product");
    const lowConfidence = { ...renamed, confidence: "low" as const, issues: ["low-confidence"] as any, review_acknowledged: true };
    expect(normalizeEditedVoiceShoppingDraftItem(lowConfidence, "quantity", 2).review_acknowledged).toBe(false);
  });
});
