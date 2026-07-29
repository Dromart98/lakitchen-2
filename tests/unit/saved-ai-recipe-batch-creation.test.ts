import { describe, expect, it } from "vitest";

import {
  buildSavedAiRecipeCookedBatchRpcPayload,
  mapCreateSavedAiRecipeCookedBatchRpcError,
  parseCreateSavedAiRecipeCookedBatchInput,
} from "@/modules/recipes/saved-ai-recipe-batch-creation";

const recipeId = "33333333-3333-4333-8333-333333333333";
const requestId = "77777777-7777-4777-8777-777777777777";
const updatedAt = "2026-07-29T12:00:00.000Z";

describe("saved AI recipe cooked batch creation contract", () => {
  it("accepts only recipe, request and confirmed-measurement version", () => {
    const input = { recipe_id: recipeId, request_id: requestId, expected_measurement_updated_at: updatedAt };
    expect(parseCreateSavedAiRecipeCookedBatchInput(input)).toEqual(input);
    expect(parseCreateSavedAiRecipeCookedBatchInput({ ...input, user_id: requestId })).toBeNull();
    expect(parseCreateSavedAiRecipeCookedBatchInput({ ...input, title: "Manipulado" })).toBeNull();
    expect(parseCreateSavedAiRecipeCookedBatchInput({ ...input, macros: {} })).toBeNull();
    expect(parseCreateSavedAiRecipeCookedBatchInput({ ...input, consumed_cooked_weight_g: 2 })).toBeNull();
    expect(parseCreateSavedAiRecipeCookedBatchInput({ ...input, expected_measurement_updated_at: "not-a-date" })).toBeNull();
  });

  it("passes only identity, optimistic version and shared consumption lines to the RPC", () => {
    expect(buildSavedAiRecipeCookedBatchRpcPayload(
      { recipe_id: recipeId, request_id: requestId, expected_measurement_updated_at: updatedAt },
      [{ item_id: recipeId, consumed_quantity: 2 }],
    )).toEqual({
      p_request_id: requestId,
      p_recipe_id: recipeId,
      p_expected_measurement_updated_at: updatedAt,
      p_lines: [{ item_id: recipeId, consumed_quantity: 2 }],
    });
  });

  it("maps database details to finite safe status codes", () => {
    expect(mapCreateSavedAiRecipeCookedBatchRpcError({ message: "measurement_conflict" })).toBe("measurement-conflict");
    expect(mapCreateSavedAiRecipeCookedBatchRpcError({ message: "equivalence_conflict" })).toBe("equivalence-conflict");
    expect(mapCreateSavedAiRecipeCookedBatchRpcError({ message: "idempotency_conflict" })).toBe("idempotency-conflict");
    expect(mapCreateSavedAiRecipeCookedBatchRpcError({ message: "relation secret does not exist" })).toBe("creation-conflict");
  });
});
