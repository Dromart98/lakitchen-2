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
  it("accepts unprepared rice and preserves an invalid cooked estimate for review", async () => {
    const rice = { ...readyItem, name: "Arroz", quantity: 1, unit: "kg", location: "pantry", category: "carbohydrate", food_state: "raw", nutrition_basis: "per_100g", calories: 360, protein_g: 7, carbs_g: 80, fat_g: 1 };
    const success = await generateVoiceInventoryBatch("1 kg de arroz a la despensa", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [rice] }) }) });
    const rejected = await generateVoiceInventoryBatch("1 kg de arroz a la despensa", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...rice, food_state: "cooked", calories: 130, carbs_g: 28 }] }) }) });
    expect(success).toMatchObject({ status: "success", items: [expect.objectContaining({ food_state: "raw", nutrition_basis: "per_100g", calories: 360 })] });
    expect(rejected).toMatchObject({ status: "needs-clarification", items: [expect.objectContaining({ name: "Arroz", quantity: 1, unit: "kg", nutrition_basis: null, calories: null, issues: expect.arrayContaining(["nutrition-incomplete"]) })] });
  });
  it("preserves explicit cooked rice", async () => {
    const result = await generateVoiceInventoryBatch("500 g de arroz cocido en la nevera", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...readyItem, name: "Arroz cocido", quantity: 500, unit: "g", location: "fridge", category: "carbohydrate", food_state: "cooked", nutrition_basis: "per_100g", calories: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.3 }] }) }) });
    expect(result).toMatchObject({ status: "success", items: [expect.objectContaining({ food_state: "cooked", nutrition_basis: "per_100g", calories: 130 })] });
  });

  it("keeps valid products when one nutrition estimate is invalid", async () => {
    const result = await generateVoiceInventoryBatch("arroz, arroz cocido dudoso y aceite", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [
      { ...readyItem, name: "Arroz", quantity: 0.5, unit: "kg", location: "pantry", category: "carbohydrate", calories: 360, protein_g: 7, carbs_g: 80, fat_g: 1 },
      { ...readyItem, name: "Arroz", quantity: 1, unit: "kg", location: "pantry", category: "carbohydrate", food_state: "cooked", calories: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.3 },
      { ...readyItem, name: "Aceite", quantity: 1, unit: "l", location: "pantry", category: "fat", food_state: "not_applicable", nutrition_basis: "per_100ml", calories: 828, protein_g: 0, carbs_g: 0, fat_g: 92 },
    ] }) }) });
    expect(result).toMatchObject({ status: "needs-clarification" });
    if (result.status === "needs-clarification") {
      expect(result.items).toHaveLength(3);
      expect(result.items.filter((item) => item.issues.includes("nutrition-incomplete"))).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ name: "Arroz", quantity: 0.5, unit: "kg", nutrition_basis: "per_100g" });
      expect(result.items[2]).toMatchObject({ name: "Aceite", quantity: 1, unit: "l", nutrition_basis: "per_100ml" });
    }
  });

  it("keeps missing quantities and ambiguous foods beside ready products", async () => {
    const pending = { ...readyItem, name: "Sal", quantity: null, unit: null, location: "pantry", category: "condiment", food_state: "not_applicable", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, confidence: "low", nutrition_assumptions: "Falta indicar la cantidad.", issues: ["quantity-missing", "unit-missing", "nutrition-incomplete"] };
    const ambiguous = { ...pending, name: "Preparado", nutrition_assumptions: "Producto ambiguo.", issues: [...pending.issues, "ambiguous-product"] };
    const result = await generateVoiceInventoryBatch("un kilo de pollo, sal y un preparado", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [readyItem, pending, ambiguous] }) }) });
    expect(result).toMatchObject({ status: "needs-clarification" });
    if (result.status === "needs-clarification") {
      expect(result.items).toHaveLength(3);
      expect(result.items[0].issues).not.toContain("quantity-missing");
      expect(result.items[1].issues).toEqual(expect.arrayContaining(["quantity-missing", "unit-missing"]));
      expect(result.items[2].issues).toContain("ambiguous-product");
    }
  });

  it("preserves the complete required Spanish list, including five spices without quantities", async () => {
    const mass = (name: string, quantity: number, unit: "g" | "kg") => ({ ...readyItem, name, quantity, unit, location: "pantry", category: "carbohydrate", nutrition_basis: "per_100g" });
    const volume = (name: string, quantity: number, unit: "l") => ({ ...readyItem, name, quantity, unit, location: "pantry", category: "condiment", food_state: "not_applicable", nutrition_basis: "per_100ml", calories: 20, protein_g: 0, carbs_g: 1, fat_g: 0 });
    const spice = (name: string) => ({ ...readyItem, name, quantity: null, unit: null, location: "pantry", category: "condiment", food_state: "not_applicable", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, confidence: "low", nutrition_assumptions: "Falta indicar la cantidad.", issues: ["quantity-missing", "unit-missing", "nutrition-incomplete"] });
    const tortillas = { ...readyItem, name: "Tortillas de trigo integral", quantity: 6, unit: "ud", location: "pantry", category: "carbohydrate", food_state: "processed", nutrition_basis: "per_unit", calories: 120, protein_g: 4, carbs_g: 20, fat_g: 3 };
    const tuna = { ...readyItem, name: "Atún", quantity: 3, unit: "ud", location: "pantry", category: "protein", food_state: "processed", package_count: 3, package_size: 143, package_size_unit: "g", nutrition_basis: "per_100g", calories: 116, protein_g: 26, carbs_g: 0, fat_g: 1 };
    const providerItems = [tortillas, tuna, mass("Arroz", 0.5, "kg"), mass("Pasta de lenteja roja", 250, "g"), volume("Aceite", 1, "l"), volume("Vinagre de manzana", 0.5, "l"), ...["Perejil", "Comino", "Canela", "Ajo molido", "Sal"].map(spice)];
    const result = await generateVoiceInventoryBatch("Seis tortillas de trigo integral en la despensa, 3 latas de atún de 143 g en la despensa, medio kilo de arroz en la despensa, doscientos cincuenta gramos de pasta de lenteja roja en la despensa, 1 litro de aceite en la despensa, medio litro de vinagre de manzana en la despensa, perejil en la despensa, comino en la despensa, canela en la despensa, ajo molido en la despensa y sal en la despensa.", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: providerItems }) }) });
    expect(result).toMatchObject({ status: "needs-clarification" });
    if (result.status === "needs-clarification") {
      expect(result.items).toHaveLength(11);
      expect(result.items.map(({ name }) => name)).toEqual(providerItems.map(({ name }) => name));
      expect(result.items.slice(6).every((item) => item.issues.includes("quantity-missing"))).toBe(true);
      expect(result.items[1]).toMatchObject({ quantity: 3, unit: "ud", package_size: 143, nutrition_basis: "per_unit" });
      expect(result.items.slice(2, 6).map(({ quantity, unit }) => [quantity, unit])).toEqual([[0.5, "kg"], [250, "g"], [1, "l"], [0.5, "l"]]);
    }
  });

  it("handles long batches in one call up to the existing maximum", async () => {
    for (const count of [20, VOICE_INVENTORY_BATCH_MAX_ITEMS]) {
      let calls = 0;
      const items = Array.from({ length: count }, (_, index) => ({ ...readyItem, name: `Producto ${index + 1}` }));
      const result = await generateVoiceInventoryBatch("lista larga", { apiKey: "test-key", fetchImpl: async () => { calls += 1; return completed({ status: "completed", output_text: JSON.stringify({ items }) }); } });
      expect(result).toMatchObject({ status: "success" });
      if (result.status === "success") expect(result.items).toHaveLength(count);
      expect(calls).toBe(1);
      expect(JSON.stringify({ items }).length).toBeLessThan(20_000);
    }
  });

  it("rejects more than 30 products as an unusable root batch", async () => {
    const items = Array.from({ length: VOICE_INVENTORY_BATCH_MAX_ITEMS + 1 }, (_, index) => ({ ...readyItem, name: `Producto ${index + 1}` }));
    const result = await generateVoiceInventoryBatch("lista demasiado larga", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items }) }) });
    expect(result).toMatchObject({ status: "error", code: "too-many-products" });
  });

  it("recovers an invalid quantity without dropping its valid neighbors", async () => {
    const items = [readyItem, { ...readyItem, name: "Arroz", quantity: -1, unit: "g", location: "pantry" }, { ...readyItem, name: "Aceite", unit: "l", nutrition_basis: "per_100ml" }];
    const result = await generateVoiceInventoryBatch("pollo, arroz y aceite", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items }) }) });
    expect(result).toMatchObject({ status: "needs-clarification", items: [
      expect.objectContaining({ name: "Pollo", quantity: 1 }),
      expect.objectContaining({ name: "Arroz", quantity: null, unit: "g", location: "pantry", issues: expect.arrayContaining(["quantity-missing"]) }),
      expect.objectContaining({ name: "Aceite" }),
    ] });
  });

  it("recovers invalid nutrition without dropping its valid neighbors", async () => {
    const items = [readyItem, { ...readyItem, name: "Arroz", protein_g: -7 }, { ...readyItem, name: "Aceite", unit: "l", nutrition_basis: "per_100ml" }];
    const result = await generateVoiceInventoryBatch("pollo, arroz y aceite", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items }) }) });
    expect(result).toMatchObject({ status: "needs-clarification", items: [
      expect.objectContaining({ name: "Pollo" }),
      expect.objectContaining({ name: "Arroz", nutrition_basis: null, calories: null, protein_g: null, issues: expect.arrayContaining(["nutrition-incomplete"]) }),
      expect.objectContaining({ name: "Aceite" }),
    ] });
  });

  it("recovers invalid package metadata and individual enums", async () => {
    const invalidPackage = { ...readyItem, name: "Atún", quantity: 3, unit: "ud", package_count: 3, package_size: -143, package_size_unit: "g", nutrition_basis: "per_100g" };
    const invalidEnums = { ...readyItem, name: "Arroz", unit: "saco", location: "armario", category: "cereal", food_state: "dry" };
    const result = await generateVoiceInventoryBatch("pollo, atún, arroz y aceite", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [readyItem, invalidPackage, invalidEnums, { ...readyItem, name: "Aceite", unit: "l", nutrition_basis: "per_100ml" }] }) }) });
    expect(result).toMatchObject({ status: "needs-clarification" });
    if (result.status === "needs-clarification") {
      expect(result.items).toHaveLength(4);
      expect(result.items[1]).toMatchObject({ name: "Atún", package_count: 3, package_size: null, issues: expect.arrayContaining(["package-size-missing"]) });
      expect(result.items[2]).toMatchObject({ name: "Arroz", unit: null, location: null, category: null, food_state: "unknown", issues: expect.arrayContaining(["unit-missing", "location-unconfirmed"]) });
    }
  });

  it("omits only a nameless item and rejects a batch with no identifiable products", async () => {
    const partial = await generateVoiceInventoryBatch("pollo y aceite", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [readyItem, { quantity: -1 }, { ...readyItem, name: "Aceite", unit: "l", nutrition_basis: "per_100ml" }] }) }) });
    expect(partial).toMatchObject({ status: "success", items: [expect.objectContaining({ name: "Pollo" }), expect.objectContaining({ name: "Aceite" })] });
    const empty = await generateVoiceInventoryBatch("nada reconocible", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ name: "" }, null, 42] }) }) });
    expect(empty).toMatchObject({ status: "error", code: "invalid-ai-response" });
  });

  it("keeps invalid roots as global errors", async () => {
    for (const root of [null, [], {}, { items: "pollo" }]) {
      const result = await generateVoiceInventoryBatch("pollo", { apiKey: "test-key", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify(root) }) });
      expect(result).toMatchObject({ status: "error", code: "invalid-ai-response" });
    }
  });
});
