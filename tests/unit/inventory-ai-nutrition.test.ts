import { describe, expect, it } from "vitest";

import { parseInventoryNutritionOpenAIResponse } from "@/lib/openai/inventory-nutrition";

const outputText = JSON.stringify({
  nutritionBasis: "per_100g",
  calories: 165,
  proteinG: 31,
  carbsG: 0,
  fatG: 4,
});

function completedResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "resp_123",
    object: "response",
    created_at: 1_752_470_400,
    status: "completed",
    error: null,
    incomplete_details: null,
    output_text: outputText,
    ...overrides,
  };
}

describe("inventory AI nutrition OpenAI response parsing", () => {
  it("treats a null provider error as success", () => {
    expect(parseInventoryNutritionOpenAIResponse(completedResponse({ error: null }))).toEqual({ ok: true, outputText });
  });

  it("treats an absent provider error as success", () => {
    const response = completedResponse();
    delete response.error;

    expect(parseInventoryNutritionOpenAIResponse(response)).toEqual({ ok: true, outputText });
  });

  it("treats an object provider error as provider-error", () => {
    expect(parseInventoryNutritionOpenAIResponse(completedResponse({ error: { code: "rate_limit_exceeded", message: "Too many requests" } }))).toEqual({ ok: false, code: "provider-error" });
  });

  it("treats a string provider error as provider-error", () => {
    expect(parseInventoryNutritionOpenAIResponse(completedResponse({ error: "rate_limit_exceeded" }))).toEqual({ ok: false, code: "provider-error" });
  });

  it("treats an incomplete status with a null provider error as invalid-ai-response", () => {
    expect(parseInventoryNutritionOpenAIResponse(completedResponse({ status: "incomplete", error: null }))).toEqual({ ok: false, code: "invalid-ai-response" });
  });
});
