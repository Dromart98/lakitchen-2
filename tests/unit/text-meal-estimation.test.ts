import { describe, expect, it } from "vitest";
import { TEXT_MEAL_AI_MODEL_DEFAULT, TEXT_MEAL_SYSTEM_PROMPT, estimateTextMealWithOpenAi } from "@/lib/openai/text-meal-estimation";

const success = { status: "success", suggested_name: "Comida", ingredients: [{ normalized_name: "Arroz".toLowerCase(), display_name: "Arroz", name: "Arroz", confidence: "medium" as const, quantity: 150, unit: "g", preparation: "cocido", calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 }], assumptions: [], confidence: "medium", message: null };
const clarification = { status: "needs-clarification", suggested_name: null, ingredients: null, assumptions: null, confidence: null, message: "No puedo estimar cuánto arroz se consumió aproximadamente." };
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const completed = (output: unknown) => response(200, { status: "completed", output_text: JSON.stringify(output) });

describe("text meal OpenAI provider", () => {
  it("instructs the provider to estimate common approximate portions and apply the raw default", () => {
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("200 g de pollo debe tratarse como pollo crudo");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("100 g de arroz debe tratarse como arroz crudo");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("preparación explícita tiene prioridad");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("cantidades aproximadas");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("needs-clarification solo");
  });
  it("keeps the documented default model", () => {
    expect(TEXT_MEAL_AI_MODEL_DEFAULT).toBe("gpt-5.6-terra");
  });
  it("normalizes the complete Structured Output success shape", async () => { let body = ""; const result = await estimateTextMealWithOpenAi("150 g arroz", { apiKey: "key", fetchImpl: async (_url, init) => { body = String(init?.body); return completed(success); } }); expect(result).toEqual({ status: "success", suggested_name: "Comida", ingredients: success.ingredients, total: { calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 }, assumptions: [], confidence: "medium" }); expect(body).toContain('"store":false'); expect(body).toContain('"effort":"low"'); });
  it("normalizes the complete Structured Output clarification shape", async () => { expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => completed(clarification) })).toEqual({ status: "needs-clarification", message: clarification.message }); });
  it("rejects incompatible complete provider payloads", async () => { expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => completed({ ...success, message: "No nulo" }) })).toEqual({ status: "error", code: "invalid-ai-response" }); expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => completed({ ...clarification, ingredients: success.ingredients }) })).toEqual({ status: "error", code: "invalid-ai-response" }); });
  it("handles provider failures and malformed responses", async () => { expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => response(500, {}) })).toEqual({ status: "error", code: "provider-error" }); expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => response(408, {}) })).toEqual({ status: "error", code: "provider-timeout" }); expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => response(200, { status: "completed", output_text: "no-json" }) })).toEqual({ status: "error", code: "invalid-ai-response" }); expect(await estimateTextMealWithOpenAi("arroz", { apiKey: "key", fetchImpl: async () => response(200, { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }) })).toEqual({ status: "error", code: "invalid-ai-response" }); });
});
