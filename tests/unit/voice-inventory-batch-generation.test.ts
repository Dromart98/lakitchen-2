import { describe, expect, it } from "vitest";
import { extractVoiceInventoryBatchOutputText } from "@/lib/openai/voice-inventory-batch-generation";

describe("voice inventory Responses extraction", () => {
  it("accepts nested Responses API output_text", () => {
    expect(extractVoiceInventoryBatchOutputText({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{\"items\":[]}" }] }] })).toEqual({ status: "success", text: "{\"items\":[]}" });
  });
  it("rejects refusals and incomplete responses safely", () => {
    expect(extractVoiceInventoryBatchOutputText({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }).status).toBe("invalid-ai-response");
    expect(extractVoiceInventoryBatchOutputText({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }).status).toBe("invalid-ai-response");
  });
});

import { generateVoiceInventoryBatch } from "@/lib/openai/voice-inventory-batch-generation";
import { VOICE_INVENTORY_BATCH_MAX_ITEMS } from "@/modules/inventory/voice-inventory-batch";

const readyItem = {
  name: "Pollo", quantity: 1, unit: "kg", location: "freezer", category: "protein",
  food_state: "raw", nutrition_basis: "per_100g", calories: 120, protein_g: 22,
  carbs_g: 0, fat_g: 3, package_count: null, package_size: null, package_size_unit: null, total_size: null, total_size_unit: null, confidence: "high", nutrition_assumptions: "Valores típicos por 100 g.", issues: [],
};
const completed = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

describe("voice inventory batch provider", () => {
  it("posts a strict, private structured request and includes the raw-default contract", async () => {
    let request: RequestInit | undefined;
    const result = await generateVoiceInventoryBatch("un kilo de pollo", {
      apiKey: "test-key", fetchImpl: async (_url, init) => {
        request = init;
        return completed({ status: "completed", output_text: JSON.stringify({ items: [readyItem] }) });
      },
    });
    const body = JSON.parse(String(request?.body));
    expect(result.status).toBe("success");
    expect(request?.method).toBe("POST");
    expect((request?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(body.store).toBe(false);
    expect(body.reasoning.effort).toBe("low");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.properties.items.maxItems).toBe(VOICE_INVENTORY_BATCH_MAX_ITEMS);
    expect(body.input[0].content).toContain("arroz");
    expect(body.input[0].content).toContain("como raw");
    expect(body.input[0].content).toContain("No apliques esta regla a platos compuestos");
    expect(body.input[0].content).toContain("pasta fresca");
    expect(body.input[0].content).toContain("No supongas que arroz, pasta seca o legumbres secas están cocinados");
    expect(body.input[0].content).toContain("No uses metadatos de envase para alimentos naturalmente contables como manzanas o huevos");
  });
  it("applies the shared validator's calibrated confidence to the draft", async () => {
    const result = await generateVoiceInventoryBatch("un kilo de pollo", {
      apiKey: "test-key",
      fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [readyItem] }) }),
    });
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.items[0].confidence).toBe("medium");
  });
  it("maps provider failures and derives missing field issues", async () => {
    const timeout = await generateVoiceInventoryBatch("pollo", { apiKey: "x", fetchImpl: async () => new Response("", { status: 408 }) });
    const rate = await generateVoiceInventoryBatch("pollo", { apiKey: "x", fetchImpl: async () => new Response("", { status: 429 }) });
    const pending = await generateVoiceInventoryBatch("pollo", { apiKey: "x", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...readyItem, quantity: null, issues: [] }] }) }) });
    expect(timeout).toMatchObject({ status: "error", code: "timeout" });
    expect(rate).toMatchObject({ status: "error", code: "rate-limited" });
    expect(pending).toMatchObject({ status: "needs-clarification" });
  });
  it("enriches an entire batch in one structured provider call without multiplying macros", async () => {
    let calls = 0;
    const result = await generateVoiceInventoryBatch("Dos kilos de pollo al congelador, seis manzanas a la nevera y un litro de leche", {
      apiKey: "test-key", fetchImpl: async () => {
        calls += 1;
        return completed({ status: "completed", output_text: JSON.stringify({ items: [
          { ...readyItem, name: "Pechuga de pollo", quantity: 2, unit: "kg", location: "freezer", calories: 120, protein_g: 23, carbs_g: 0, fat_g: 2 },
          { ...readyItem, name: "Manzana", quantity: 6, unit: "ud", location: "fridge", category: "fruit", food_state: "not_applicable", nutrition_basis: "per_unit", calories: 80, protein_g: 0.4, carbs_g: 21, fat_g: 0.3 },
          { ...readyItem, name: "Leche", quantity: 1, unit: "l", location: "fridge", category: "dairy", food_state: "not_applicable", nutrition_basis: "per_100ml", calories: 46, protein_g: 3.2, carbs_g: 4.8, fat_g: 1.5 },
        ] }) });
      },
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ status: "success" });
    if (result.status === "success") {
      expect(result.items.map((item) => [item.quantity, item.unit, item.nutrition_basis, item.calories])).toEqual([[2, "kg", "per_100g", 120], [6, "ud", "per_unit", 80], [1, "l", "per_100ml", 46]]);
      expect(result.items[0].issues).not.toContain("nutrition-incomplete");
    }
  });
  it("keeps an unweighed package blocked instead of inventing nutrition", async () => {
    const result = await generateVoiceInventoryBatch("Dos paquetes de pollo", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...readyItem, name: "Pollo", quantity: null, unit: null, nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, confidence: "low", food_state: "raw", nutrition_assumptions: "Falta el peso de cada paquete.", issues: ["package-size-missing", "nutrition-incomplete", "ambiguous-product"] }] }) }) });
    expect(result).toMatchObject({ status: "needs-clarification" });
    if (result.status === "needs-clarification") expect(result.items[0].issues).toEqual(expect.arrayContaining(["package-size-missing", "nutrition-incomplete"]));
  });
  it("accepts unprepared rice as raw and rejects cooked rice values", async () => {
    const rice = { ...readyItem, name: "Arroz", quantity: 1, unit: "kg", location: "pantry", category: "carbohydrate", food_state: "raw", nutrition_basis: "per_100g", calories: 360, protein_g: 7, carbs_g: 80, fat_g: 1 };
    const success = await generateVoiceInventoryBatch("1 kg de arroz a la despensa", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [rice] }) }) });
    const rejected = await generateVoiceInventoryBatch("1 kg de arroz a la despensa", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...rice, food_state: "cooked", calories: 130, carbs_g: 28 }] }) }) });
    expect(success).toMatchObject({ status: "success", items: [expect.objectContaining({ food_state: "raw", nutrition_basis: "per_100g", calories: 360 })] });
    expect(rejected).toMatchObject({ status: "error", code: "invalid-ai-response" });
  });
  it("preserves explicit cooked rice", async () => {
    const result = await generateVoiceInventoryBatch("500 g de arroz cocido en la nevera", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...readyItem, name: "Arroz cocido", quantity: 500, unit: "g", location: "fridge", category: "carbohydrate", food_state: "cooked", nutrition_basis: "per_100g", calories: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.3 }] }) }) });
    expect(result).toMatchObject({ status: "success", items: [expect.objectContaining({ food_state: "cooked", nutrition_basis: "per_100g", calories: 130 })] });
  });
});
