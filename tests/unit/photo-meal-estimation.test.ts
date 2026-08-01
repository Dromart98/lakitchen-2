import { describe, expect, it } from "vitest";

import {
  PHOTO_MEAL_AI_MODEL_DEFAULT,
  PHOTO_MEAL_SYSTEM_PROMPT,
  estimatePhotoMealWithOpenAi,
  normalizePhotoMealProviderOutput,
} from "@/lib/openai/photo-meal-estimation";
import { validateTextMealProviderOutput } from "@/modules/meals/text-meal-ai";

const chicken = { normalized_name: "Pechuga de pollo".toLowerCase(), display_name: "Pechuga de pollo", name: "Pechuga de pollo", confidence: "medium" as const, quantity: 180, unit: "g", preparation: "cocinado", calories: 297, protein_g: 55.8, carbs_g: 0, fat_g: 6.5 };
const rice = { normalized_name: "Arroz blanco".toLowerCase(), display_name: "Arroz blanco", name: "Arroz blanco", confidence: "medium" as const, quantity: 150, unit: "g", preparation: "cocido", calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 };
const success = { status: "success", suggested_name: "Pollo con arroz", ingredients: [chicken, rice], assumptions: ["Las cantidades de pollo y arroz se estimaron visualmente por la proporción que ocupan en el plato; son aproximadas.", "Se asumió pollo cocinado y arroz cocido por la apariencia de un plato servido."], confidence: "medium", message: null };
const clarification = { status: "needs-clarification", suggested_name: null, ingredients: null, assumptions: null, confidence: null, message: "La imagen está demasiado borrosa para identificar alimentos con suficiente seguridad." };
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const completed = (value: unknown) => response(200, { status: "completed", output_text: JSON.stringify(value) });

describe("photo meal prompt", () => {
  it("requires prudent visual estimates for a clear chicken-and-rice plate without an exact scale", () => {
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("“arroz con pollo” debe producir arroz cocido y pollo cocinado como dos ingredientes independientes");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("aunque no haya báscula");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("proporción que ocupa cada alimento");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("Declara en assumptions cada peso o cantidad estimado visualmente");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("medium o low para porciones estimadas visualmente sin peso conocido");
  });

  it("limits clarification to unusable or genuinely ambiguous images", () => {
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("únicamente si la fotografía es realmente inutilizable o ambigua");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("Una fotografía clara de un plato único con alimentos reconocibles debe devolver success");
  });

  it("uses visible preparation and context without inventing hidden oil or sauces", () => {
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("No copies automáticamente una política de crudo");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("pollo dorado, asado o a la plancha como cocinado");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("arroz servido como cocido normalmente");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("cantidad explícita y razonable del usuario prevalece");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("no añadas por defecto aceite, mantequilla, salsas");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("g, ml, unidad");
  });

  it("states the status-dependent null contract that the flat provider schema cannot express", () => {
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("Si status es success, message debe ser null");
    expect(PHOTO_MEAL_SYSTEM_PROMPT).toContain("Si status es needs-clarification, suggested_name, ingredients, assumptions y confidence deben ser null");
  });
});

describe("photo meal OpenAI provider", () => {
  it("sends the complete strict multimodal request with text before the high-detail image", async () => {
    let body: any;
    await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "con aceite", { apiKey: "key", fetchImpl: async (_url, init) => { body = JSON.parse(String(init?.body)); return completed(success); } });
    expect(body.model).toBe(PHOTO_MEAL_AI_MODEL_DEFAULT);
    expect(body.input[1].content).toEqual([
      { type: "input_text", text: "con aceite" },
      { type: "input_image", image_url: "data:image/jpeg;base64,/9j/", detail: "high" },
    ]);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, name: "photo_meal_estimation" });
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.max_output_tokens).toBe(2500);
  });

  it("uses the configured model and fallback context", async () => {
    await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", model: "configured-photo-model", fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("configured-photo-model");
      expect(body.input[1].content[0]).toEqual({ type: "input_text", text: "Analiza esta fotografía de comida." });
      return completed(success);
    } });
  });

  it("normalizes a useful chicken-and-rice estimation, retaining separate cooked ingredients and recalculated totals", async () => {
    const result = await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", fetchImpl: async () => completed(success) });
    expect(result).toEqual({ status: "success", suggested_name: "Pollo con arroz", ingredients: [chicken, rice], total: { calories: 492, protein_g: 59.8, carbs_g: 42, fat_g: 7 }, assumptions: success.assumptions, confidence: "medium" });
  });

  it("keeps a general dish name separate from normalized, independently estimated cooked ingredients", async () => {
    const result = await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", fetchImpl: async () => completed(success) });
    expect(result).toMatchObject({ status: "success", suggested_name: "Pollo con arroz", ingredients: [
      { normalized_name: "pechuga de pollo", display_name: "Pechuga de pollo", preparation: "cocinado", quantity: 180 },
      { normalized_name: "arroz blanco", display_name: "Arroz blanco", preparation: "cocido", quantity: 150 },
    ] });
  });

  it("discards only fields that are irrelevant for the provider-selected status", async () => {
    const successWithProviderMessage = { ...success, message: "Estimación orientativa lista" };
    expect(normalizePhotoMealProviderOutput(successWithProviderMessage)).toEqual({ ...successWithProviderMessage, message: null });
    expect(await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", fetchImpl: async () => completed(successWithProviderMessage) })).toMatchObject({ status: "success", suggested_name: "Pollo con arroz" });

    const clarificationWithIrrelevantPayload = { ...clarification, suggested_name: "Ignorar", ingredients: [chicken], assumptions: ["Ignorar"], confidence: "low" };
    expect(normalizePhotoMealProviderOutput(clarificationWithIrrelevantPayload)).toEqual({ ...clarificationWithIrrelevantPayload, suggested_name: null, ingredients: null, assumptions: null, confidence: null });
    expect(await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", fetchImpl: async () => completed(clarificationWithIrrelevantPayload) })).toEqual({ status: "needs-clarification", message: clarification.message });
  });

  it("accepts clarification only as a valid structured outcome and rejects invalid relevant provider responses", async () => {
    expect(await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", fetchImpl: async () => completed(clarification) })).toEqual({ status: "needs-clarification", message: clarification.message });
    const invalids = [response(408, {}), response(500, {}), response(200, { status: "incomplete" }), response(200, { status: "completed", output: [{ content: [{ type: "refusal" }] }] }), response(200, { status: "completed" }), response(200, { status: "completed", output_text: "not json" }), completed({ ...success, ingredients: [{ ...chicken, protein_g: -1 }] }), completed({ ...clarification, message: null })];
    for (const item of invalids) expect((await estimatePhotoMealWithOpenAi("data:image/jpeg;base64,/9j/", "", { apiKey: "key", fetchImpl: async () => item })).status).toBe("error");
  });
});

describe("photo meal structured output contract", () => {
  it("rejects negative macros, invalid units, and additional properties through the shared strict validator", () => {
    expect(validateTextMealProviderOutput({ ...success, ingredients: [{ ...chicken, protein_g: -1 }] })).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(validateTextMealProviderOutput({ ...success, ingredients: [{ ...rice, unit: "bol" }] })).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(validateTextMealProviderOutput({ ...success, ingredients: [] })).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(validateTextMealProviderOutput({ ...success, ingredients: [{ ...rice, quantity: Number.NaN }] })).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(validateTextMealProviderOutput({ ...success, extra: true })).toEqual({ status: "error", code: "invalid-ai-response" });
  });
});
