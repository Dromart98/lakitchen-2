import { describe, expect, it } from "vitest";

import {
  buildVoiceShoppingBatchSaveItems,
  toVoiceShoppingBatchSaveInput,
} from "@/modules/shopping/voice-shopping-batch-save";

const submissionId = "123e4567-e89b-42d3-a456-426614174000";
const item = { name: " Leche ", quantity: 1, unit: "l" };

describe("voice shopping batch save schema", () => {
  it("accepts one through thirty strict items", () => {
    expect(toVoiceShoppingBatchSaveInput(submissionId, [item]).success).toBe(true);
    expect(toVoiceShoppingBatchSaveInput(submissionId, Array.from({ length: 30 }, () => item)).success).toBe(true);
  });

  it("rejects malformed, non-finite, and additional data", () => {
    const invalid = [
      [], Array.from({ length: 31 }, () => item), [{ ...item, name: "" }],
      [{ ...item, name: "x".repeat(121) }], [{ ...item, quantity: null }],
      [{ ...item, quantity: 0 }], [{ ...item, quantity: -1 }],
      [{ ...item, quantity: NaN }], [{ ...item, quantity: Infinity }],
      [{ ...item, unit: "box" }], [{ ...item, client_id: "draft" }],
    ];
    for (const items of invalid) expect(toVoiceShoppingBatchSaveInput(submissionId, items).success).toBe(false);
  });

  it("maps only persistence fields without mutating the draft", () => {
    const drafts: any[] = [{ ...item, client_id: "draft", confidence: "low", issues: ["low-confidence"], review_acknowledged: true }];
    const before = structuredClone(drafts);
    const result = buildVoiceShoppingBatchSaveItems(drafts);
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data[0])).toEqual(["name", "quantity", "unit"]);
    expect(drafts).toEqual(before);
  });
});
