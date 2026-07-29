import { describe, expect, it } from "vitest";

import { generateVoiceInventoryBatch } from "@/lib/openai/voice-inventory-batch-generation";

const pendingItem = {
  name: "Pollo",
  quantity: 1,
  unit: "kg",
  location: "pantry",
  category: "protein",
  food_state: "raw",
  nutrition_basis: null,
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  confidence: "low",
  nutrition_assumptions: "Nutrición pendiente.",
  package_count: null,
  package_measure_kind: null,
  package_size: null,
  package_size_unit: null,
  total_size: null,
  total_size_unit: null,
  issues: ["nutrition-incomplete"],
};

const completed = (items: unknown[]) => new Response(JSON.stringify({
  status: "completed",
  output_text: JSON.stringify({ items }),
}), { status: 200 });

describe("voice inventory location reconciliation integration", () => {
  it("corrects provider locations from deterministic section evidence", async () => {
    const result = await generateVoiceInventoryBatch(
      "En la nevera tengo pollo. En el congelador tengo pimiento. En la despensa tengo atún.",
      {
        apiKey: "test-key",
        fetchImpl: async () => completed([
          { ...pendingItem, name: "Pollo", location: "pantry" },
          { ...pendingItem, name: "Pimiento", location: "fridge", category: "vegetable" },
          { ...pendingItem, name: "Atún", location: "freezer", category: "protein", food_state: "processed" },
        ]),
      },
    );

    expect(result.status).toBe("needs-clarification");
    if (result.status === "needs-clarification") {
      expect(result.items.map(({ name, location }) => [name, location])).toEqual([
        ["Pollo", "fridge"],
        ["Pimiento", "freezer"],
        ["Atún", "pantry"],
      ]);
    }
  });

  it("keeps explicit overrides and strips unsupported provider locations", async () => {
    const explicit = await generateVoiceInventoryBatch(
      "En la nevera tengo pollo y huevos, pero el pan está en el congelador.",
      {
        apiKey: "test-key",
        fetchImpl: async () => completed([
          { ...pendingItem, name: "Pollo", location: "freezer" },
          { ...pendingItem, name: "Huevos", quantity: 6, unit: "ud", location: "pantry", category: null },
          { ...pendingItem, name: "Pan", quantity: 1, unit: "ud", location: "fridge", category: "carbohydrate", food_state: "processed" },
        ]),
      },
    );
    expect(explicit.status).toBe("needs-clarification");
    if (explicit.status === "needs-clarification") {
      expect(explicit.items.map(({ name, location }) => [name, location])).toEqual([
        ["Pollo", "fridge"],
        ["Huevos", "fridge"],
        ["Pan", "freezer"],
      ]);
    }

    const unsupported = await generateVoiceInventoryBatch("Tengo pollo, arroz y aceite.", {
      apiKey: "test-key",
      fetchImpl: async () => completed([
        { ...pendingItem, name: "Pollo", location: "freezer" },
        { ...pendingItem, name: "Arroz", location: "pantry", category: "carbohydrate" },
        { ...pendingItem, name: "Aceite", quantity: 1, unit: "l", location: "pantry", category: "fat", food_state: "not_applicable" },
      ]),
    });
    expect(unsupported.status).toBe("needs-clarification");
    if (unsupported.status === "needs-clarification") {
      expect(unsupported.items.every((item) => item.location === null && item.issues.includes("location-unconfirmed"))).toBe(true);
    }
  });

  it("preserves a long multisection batch including pending spices", async () => {
    const pantryNames = ["Tortillas de trigo integral", "Atún", "Arroz", "Pasta de lenteja roja", "Aceite", "Vinagre de manzana", "Perejil", "Comino", "Canela", "Ajo molido", "Sal"];
    const text = "En la despensa tengo seis tortillas de trigo integral, 3 latas de atún de 143 g, medio kilo de arroz, doscientos cincuenta gramos de pasta de lenteja roja, 1 litro de aceite, medio litro de vinagre de manzana, perejil, comino, canela, ajo molido y sal. En la nevera tengo pollo y leche. En el congelador tengo pescado y pimiento.";
    const items = [
      ...pantryNames.map((name) => ({ ...pendingItem, name, location: "fridge" })),
      { ...pendingItem, name: "Pollo", location: "pantry" },
      { ...pendingItem, name: "Leche", quantity: 1, unit: "l", location: "pantry", category: "dairy", food_state: "not_applicable" },
      { ...pendingItem, name: "Pescado", location: "pantry" },
      { ...pendingItem, name: "Pimiento", location: "pantry", category: "vegetable" },
    ];

    const result = await generateVoiceInventoryBatch(text, {
      apiKey: "test-key",
      fetchImpl: async () => completed(items),
    });
    expect(result.status).toBe("needs-clarification");
    if (result.status === "needs-clarification") {
      expect(result.items).toHaveLength(15);
      expect(result.items.slice(0, 11).every((item) => item.location === "pantry")).toBe(true);
      expect(result.items.slice(11, 13).every((item) => item.location === "fridge")).toBe(true);
      expect(result.items.slice(13).every((item) => item.location === "freezer")).toBe(true);
    }
  });
});
