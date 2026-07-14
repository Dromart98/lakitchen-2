import { describe, expect, it, vi } from "vitest";

import {
  buildInventoryNutritionAiInputText,
  getExpectedInventoryNutritionBasis,
  isCompatibleInventoryNutritionAiBasis,
  parseInventoryNutritionAiInput,
  requiresInventoryNutritionAiOverwriteConfirmation,
  validateInventoryNutritionAiOutput,
  type InventoryNutritionAiInput,
} from "@/modules/inventory/inventory-ai-nutrition";

const validInput: InventoryNutritionAiInput = { name: "Pechuga de pollo cruda", quantity: 2, unit: "kg", category: "protein" };
const validOutput = { status: "estimated", nutrition_basis: "per_100g", calories: 120, protein_g: 23, carbs_g: 0, fat_g: 2, confidence: "medium", assumptions: "Pollo crudo típico.", clarification: null };

describe("parseInventoryNutritionAiInput", () => {
  it.each([
    [{ ...validInput, name: "" }],
    [{ ...validInput, name: "a".repeat(121) }],
    [{ ...validInput, unit: "oz" }],
    [{ ...validInput, category: "snack" }],
    [{ ...validInput, quantity: 0 }],
    [{ ...validInput, quantity: -1 }],
    [{ ...validInput, quantity: Number.NaN }],
    [{ ...validInput, quantity: Infinity }],
  ])("rejects invalid input %#", (input) => {
    expect(parseInventoryNutritionAiInput(input)).toBeNull();
  });

  it("accepts valid input with quantity", () => {
    expect(parseInventoryNutritionAiInput({ ...validInput, name: "  Huevo L  " })).toEqual({ ...validInput, name: "Huevo L" });
  });

  it("accepts valid input without quantity", () => {
    expect(parseInventoryNutritionAiInput({ ...validInput, quantity: null })).toEqual({ ...validInput, quantity: null });
  });
});

describe("nutrition basis rules", () => {
  it.each([
    ["g", "per_100g"], ["kg", "per_100g"], ["ml", "per_100ml"], ["l", "per_100ml"], ["ud", "per_unit"],
  ] as const)("%s produces only %s", (unit, basis) => {
    expect(getExpectedInventoryNutritionBasis(unit)).toBe(basis);
    expect(isCompatibleInventoryNutritionAiBasis(unit, basis)).toBe(true);
  });

  it("rejects incompatible combinations", () => {
    expect(isCompatibleInventoryNutritionAiBasis("g", "per_unit")).toBe(false);
    expect(isCompatibleInventoryNutritionAiBasis("ml", "per_100g")).toBe(false);
    expect(isCompatibleInventoryNutritionAiBasis("ud", "per_100ml")).toBe(false);
  });
});

describe("validateInventoryNutritionAiOutput", () => {
  it("accepts complete valid values", () => {
    expect(validateInventoryNutritionAiOutput(validInput, validOutput)).toMatchObject({ status: "success", estimate: { calories: 120 } });
  });

  it.each([
    { ...validOutput, protein_g: -1 },
    { ...validOutput, protein_g: Number.NaN },
    { ...validOutput, protein_g: Infinity },
    { ...validOutput, nutrition_basis: null },
    { ...validOutput, fat_g: null },
    { ...validOutput, calories: 1001 },
    { ...validOutput, protein_g: 101 },
    { ...validOutput, nutrition_basis: "per_unit" },
    { status: "estimated", nutrition_basis: "per_100g" },
    { ...validOutput, calories: "120" },
  ])("rejects invalid output %#", (output) => {
    expect(validateInventoryNutritionAiOutput(validInput, output).status).toBe("invalid");
  });

  it("accepts coherent needs_clarification", () => {
    expect(validateInventoryNutritionAiOutput(validInput, { status: "needs_clarification", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, confidence: "low", assumptions: "", clarification: "Describe el plato." })).toEqual({ status: "needs-clarification", message: "Describe el plato." });
  });

  it("rejects needs_clarification with macros present", () => {
    expect(validateInventoryNutritionAiOutput(validInput, { ...validOutput, status: "needs_clarification", clarification: "Aclara." }).status).toBe("invalid");
  });
});

describe("base values are not multiplied by quantity", () => {
  it("does not multiply 2 kg of chicken by 20", () => {
    const result = validateInventoryNutritionAiOutput(validInput, validOutput);
    expect(result.status === "success" && result.estimate.calories).toBe(120);
    expect(buildInventoryNutritionAiInputText(validInput)).toContain("solo contexto, no multiplicar");
  });

  it("does not multiply 12 eggs by 12", () => {
    const input: InventoryNutritionAiInput = { name: "Huevo L", quantity: 12, unit: "ud", category: "protein" };
    const result = validateInventoryNutritionAiOutput(input, { ...validOutput, nutrition_basis: "per_unit", calories: 72, protein_g: 6, fat_g: 5 });
    expect(result.status === "success" && result.estimate.calories).toBe(72);
  });
});

describe("overwrite confirmation", () => {
  it.each([
    [{ nutritionBasis: "", calories: "", proteinG: "", carbsG: "", fatG: "" }, false],
    [{ nutritionBasis: "per_100g", calories: "", proteinG: "", carbsG: "", fatG: "" }, true],
    [{ nutritionBasis: "", calories: "1", proteinG: "", carbsG: "", fatG: "" }, true],
    [{ nutritionBasis: "", calories: "", proteinG: "1", carbsG: "", fatG: "" }, true],
    [{ nutritionBasis: "per_100g", calories: "1", proteinG: "1", carbsG: "1", fatG: "1" }, true],
    [{ nutritionBasis: " ", calories: " ", proteinG: " ", carbsG: " ", fatG: " " }, false],
  ])("returns %s", (values, expected) => {
    expect(requiresInventoryNutritionAiOverwriteConfirmation(values)).toBe(expected);
  });
});

describe("OpenAI provider behavior", () => {
  async function loadProvider() {
    vi.resetModules();
    vi.doMock("openai/helpers/zod", () => ({ zodTextFormat: () => ({ type: "json_schema" }) }));
    vi.doMock("openai", () => ({ default: class OpenAI {} }));
    return import("@/lib/openai/inventory-nutrition");
  }

  it("handles a valid response", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await loadProvider();
    const client = { responses: { parse: async () => ({ output_parsed: validOutput }) } };
    await expect(estimateInventoryNutritionWithOpenAi(validInput, { client })).resolves.toMatchObject({ status: "success" });
  });

  it("handles needs_clarification", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await loadProvider();
    const client = { responses: { parse: async () => ({ output_parsed: { status: "needs_clarification", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, confidence: "low", assumptions: "", clarification: "Necesito más detalle." } }) } };
    await expect(estimateInventoryNutritionWithOpenAi(validInput, { client })).resolves.toEqual({ status: "needs-clarification", message: "Necesito más detalle." });
  });

  it.each([
    [{ name: "TimeoutError" }, "timeout"],
    [{ status: 429 }, "rate-limited"],
    [{ status: 500 }, "provider-error"],
  ])("maps provider errors %#", async (error, code) => {
    const { estimateInventoryNutritionWithOpenAi } = await loadProvider();
    const client = { responses: { parse: async () => { throw error; } } };
    await expect(estimateInventoryNutritionWithOpenAi(validInput, { client })).resolves.toEqual({ status: "error", code });
  });

  it("returns invalid-ai-response for invalid structured data", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await loadProvider();
    const client = { responses: { parse: async () => ({ output_parsed: { ...validOutput, calories: 5000 } }) } };
    await expect(estimateInventoryNutritionWithOpenAi(validInput, { client })).resolves.toEqual({ status: "error", code: "invalid-ai-response" });
  });
});
