import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildInventoryNutritionAiInputText,
  calibrateInventoryNutritionAiConfidence,
  detectExplicitInventoryFoodState,
  getExpectedInventoryNutritionBasis,
  isCompatibleInventoryNutritionAiBasis,
  parseInventoryNutritionAiInput,
  requiresInventoryNutritionAiOverwriteConfirmation,
  validateInventoryNutritionAiOutput,
  type InventoryNutritionAiInput,
  type InventoryNutritionAiOutput,
} from "@/modules/inventory/inventory-ai-nutrition";

const validInput: InventoryNutritionAiInput = { name: "Pechuga de pollo cruda", quantity: 2, unit: "kg", category: "protein" };
const validOutput = { status: "estimated", nutrition_basis: "per_100g", calories: 120, protein_g: 23, carbs_g: 0, fat_g: 2, confidence: "medium", food_state: "raw", normalized_food_name: "Pechuga de pollo cruda", assumptions: "Pollo crudo típico.", clarification: null } satisfies InventoryNutritionAiOutput;


describe("detectExplicitInventoryFoodState", () => {
  it.each([
    ["Pechuga de pollo cruda", "raw"],
    ["Pechuga de pollo sin cocinar", "raw"],
    ["Pechuga de pollo a la plancha", "cooked"],
    ["Pollo asado", "cooked"],
    ["Atún en conserva", "processed"],
  ] as const)("detects %s as %s", (name, expected) => {
    expect(detectExplicitInventoryFoodState(name)).toBe(expected);
  });

  it.each([
    "Pechuga de pollo",
    "Queso fresco",
    "Pasta fresca",
    "Leche fresca",
  ])("returns null for %s when no explicit state is present", (name) => {
    expect(detectExplicitInventoryFoodState(name)).toBeNull();
  });

  it("keeps detecting raw food without fresco markers", () => {
    expect(detectExplicitInventoryFoodState("Carne cruda")).toBe("raw");
  });

  it("does not match partial words", () => {
    expect(detectExplicitInventoryFoodState("crudoria planchado frescoide conservador")).toBeNull();
  });
});

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

  it("accepts raw input with raw output", () => {
    expect(validateInventoryNutritionAiOutput(validInput, { ...validOutput, food_state: "raw" }).status).toBe("success");
  });

  it("rejects raw input with cooked output", () => {
    expect(validateInventoryNutritionAiOutput(validInput, { ...validOutput, food_state: "cooked" })).toEqual({ status: "invalid", reason: "food-state" });
  });

  it("rejects cooked input with raw output", () => {
    const input: InventoryNutritionAiInput = { ...validInput, name: "Pechuga de pollo a la plancha" };
    expect(validateInventoryNutritionAiOutput(input, { ...validOutput, food_state: "raw" })).toEqual({ status: "invalid", reason: "food-state" });
  });

  it("accepts processed input with processed output", () => {
    const input: InventoryNutritionAiInput = { ...validInput, name: "Atún en conserva" };
    expect(validateInventoryNutritionAiOutput(input, { ...validOutput, food_state: "processed", normalized_food_name: "Atún en conserva" }).status).toBe("success");
  });

  it.each(["", " ", "a", "a".repeat(121)])("rejects estimated output with invalid normalized food name %#", (normalizedFoodName) => {
    expect(validateInventoryNutritionAiOutput(validInput, { ...validOutput, normalized_food_name: normalizedFoodName })).toEqual({ status: "invalid", reason: "normalized-food-name" });
  });

  it("accepts estimated output with a valid normalized food name", () => {
    expect(validateInventoryNutritionAiOutput(validInput, { ...validOutput, normalized_food_name: "Pi" }).status).toBe("success");
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
    { ...validOutput, assumptions: "" },
  ])("rejects invalid output %#", (output) => {
    expect(validateInventoryNutritionAiOutput(validInput, output).status).toBe("invalid");
  });

  it.each(["", "   ", "Plato ambiguo"])("accepts coherent needs_clarification with normalized food name %#", (normalizedFoodName) => {
    expect(validateInventoryNutritionAiOutput(validInput, {
      status: "needs_clarification",
      nutrition_basis: null,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      confidence: "low",
      food_state: "unknown",
      normalized_food_name: normalizedFoodName,
      assumptions: "",
      clarification: "Describe el plato.",
    })).toEqual({ status: "needs-clarification", message: "Describe el plato." });
  });

  it("rejects needs_clarification with empty clarification", () => {
    expect(validateInventoryNutritionAiOutput(validInput, {
      status: "needs_clarification",
      nutrition_basis: null,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      confidence: "low",
      food_state: "unknown",
      normalized_food_name: "",
      assumptions: "",
      clarification: "   ",
    })).toEqual({ status: "invalid", reason: "needs-clarification" });
  });

  it("rejects needs_clarification with calories present", () => {
    expect(validateInventoryNutritionAiOutput(validInput, {
      status: "needs_clarification",
      nutrition_basis: null,
      calories: 1,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      confidence: "low",
      food_state: "unknown",
      normalized_food_name: "",
      assumptions: "",
      clarification: "Aclara.",
    })).toEqual({ status: "invalid", reason: "needs-clarification" });
  });

  it("rejects needs_clarification with a macro present", () => {
    expect(validateInventoryNutritionAiOutput(validInput, {
      status: "needs_clarification",
      nutrition_basis: null,
      calories: null,
      protein_g: 1,
      carbs_g: null,
      fat_g: null,
      confidence: "low",
      food_state: "unknown",
      normalized_food_name: "",
      assumptions: "",
      clarification: "Aclara.",
    })).toEqual({ status: "invalid", reason: "needs-clarification" });
  });
});


describe("calibrateInventoryNutritionAiConfidence", () => {
  it("never raises low confidence to high", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, { ...validOutput, confidence: "low" })).toBe("low");
  });

  it("keeps medium confidence unchanged", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, { ...validOutput, confidence: "medium" })).toBe("medium");
  });

  it("reduces high confidence with unknown state", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, { ...validOutput, confidence: "high", food_state: "unknown" })).toBe("medium");
  });

  it("keeps high confidence with matching raw assumptions", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, {
      ...validOutput,
      confidence: "high",
      assumptions: "Pechuga de pollo cruda típica",
    })).toBe("high");
  });

  it("keeps high confidence with matching cooked assumptions", () => {
    const input: InventoryNutritionAiInput = { ...validInput, name: "Pechuga de pollo a la plancha" };

    expect(calibrateInventoryNutritionAiConfidence(input, {
      ...validOutput,
      confidence: "high",
      food_state: "cooked",
      normalized_food_name: "Pechuga de pollo a la plancha",
      assumptions: "Pechuga de pollo a la plancha típica",
    })).toBe("high");
  });

  it("keeps high confidence with matching processed assumptions", () => {
    const input: InventoryNutritionAiInput = { ...validInput, name: "Atún en conserva" };

    expect(calibrateInventoryNutritionAiConfidence(input, {
      ...validOutput,
      confidence: "high",
      food_state: "processed",
      normalized_food_name: "Atún en conserva",
      assumptions: "Atún en conserva típico",
    })).toBe("high");
  });

  it("reduces high confidence when assumptions contradict the explicit raw state", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, {
      ...validOutput,
      confidence: "high",
      assumptions: "Se ha supuesto pechuga a la plancha",
    })).toBe("medium");
  });

  it("reduces high confidence when assumptions introduce a cooked state without input state", () => {
    const input: InventoryNutritionAiInput = { ...validInput, name: "Pechuga de pollo" };

    expect(calibrateInventoryNutritionAiConfidence(input, {
      ...validOutput,
      confidence: "high",
      food_state: "cooked",
      normalized_food_name: "Pechuga de pollo",
      assumptions: "Se ha supuesto preparación a la plancha",
    })).toBe("medium");
  });

  it("reduces high confidence when assumptions introduce an unprovided brand", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, {
      ...validOutput,
      confidence: "high",
      assumptions: "Se ha supuesto una marca habitual",
    })).toBe("medium");
  });

  it("reduces high confidence when an invented preparation appears in normalized name", () => {
    expect(calibrateInventoryNutritionAiConfidence(validInput, { ...validOutput, confidence: "high", normalized_food_name: "Pechuga de pollo a la plancha" })).toBe("medium");
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


describe("InventoryNutritionAiControls confidence labels", () => {
  it("shows Spanish confidence labels instead of raw enum values", () => {
    const source = readFileSync("components/inventory/InventoryNutritionAiControls.tsx", "utf8");

    expect(source).toContain("Confianza alta");
    expect(source).toContain("Confianza media");
    expect(source).toContain("Confianza baja");
    expect(source).not.toContain("HIGH");
    expect(source).not.toContain("MEDIUM");
    expect(source).not.toContain("LOW");
  });
});

describe("OpenAI fetch provider behavior", () => {
  const successfulResponseBody = {
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(validOutput), annotations: [] }],
      },
    ],
  };

  function createJsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
  }

  function createFetch(response: Response) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return response;
    };

    return { fetchImpl, calls };
  }

  it("sends the expected Responses API request without logging secrets", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const { fetchImpl, calls } = createFetch(createJsonResponse(successfulResponseBody));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toMatchObject({ status: "success" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeTruthy();
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(calls[0].init.body)) as {
      model: string;
      store: boolean;
      max_output_tokens: number;
      reasoning: { effort: string };
      text: { format: { type: string; strict: boolean; schema: { required: string[] } } };
    };

    expect(body.model).toBe("gpt-5.6-terra");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(500);
    expect(body.reasoning.effort).toBe("low");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.required).toEqual([
      "status",
      "nutrition_basis",
      "calories",
      "protein_g",
      "carbs_g",
      "fat_g",
      "confidence",
      "food_state",
      "normalized_food_name",
      "assumptions",
      "clarification",
    ]);
  });

  it("accepts a completed response with error null", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const { fetchImpl } = createFetch(createJsonResponse(successfulResponseBody));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toMatchObject({ status: "success" });
  });

  it("accepts a completed response without an error property", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const responseWithoutError = { ...successfulResponseBody } as Record<string, unknown>;
    delete responseWithoutError.error;
    const { fetchImpl } = createFetch(createJsonResponse(responseWithoutError));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toMatchObject({ status: "success" });
  });

  it("uses a configurable model", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const { fetchImpl, calls } = createFetch(createJsonResponse(successfulResponseBody));

    await estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", model: "custom-model", fetchImpl });

    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ model: "custom-model" });
  });

  it("handles a valid root output_text fallback", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const { fetchImpl } = createFetch(createJsonResponse({ status: "completed", output_text: JSON.stringify(validOutput) }));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toMatchObject({ status: "success" });
  });

  it("handles needs_clarification", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const output = { status: "needs_clarification", nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, confidence: "low", food_state: "unknown", normalized_food_name: "Alimento ambiguo", assumptions: "", clarification: "Necesito más detalle." };
    const { fetchImpl } = createFetch(createJsonResponse({ status: "completed", error: null, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toEqual({ status: "needs-clarification", message: "Necesito más detalle." });
  });

  it.each([
    [{ status: "completed", error: null, output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }] }, "invalid-ai-response"],
    [{ status: "completed", error: null, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ ...validOutput, calories: 5000 }) }] }] }, "invalid-ai-response"],
    [{ status: "incomplete", error: null, output: [] }, "invalid-ai-response"],
    [{ status: "completed", error: { message: "provider failed" } }, "provider-error"],
    [{ status: "completed", error: "provider failed" }, "provider-error"],
    [{ status: "completed", error: null, output: [{ type: "message", content: [{ type: "output_text", text: "" }] }] }, "invalid-ai-response"],
    [{ status: "completed", error: null, output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] }, "invalid-ai-response"],
  ])("maps malformed provider body %#", async (body, code) => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const { fetchImpl } = createFetch(createJsonResponse(body));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toEqual({ status: "error", code });
  });

  it.each([
    [408, "timeout"],
    [429, "rate-limited"],
    [400, "provider-error"],
    [401, "provider-error"],
    [403, "provider-error"],
    [500, "provider-error"],
  ])("maps HTTP %s", async (status, code) => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const { fetchImpl } = createFetch(createJsonResponse({ error: "hidden" }, { status }));

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toEqual({ status: "error", code });
  });

  it("maps AbortError to timeout", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const fetchImpl: typeof fetch = async () => { throw new DOMException("Aborted", "AbortError"); };

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toEqual({ status: "error", code: "timeout" });
  });

  it("maps network errors to provider-error", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const fetchImpl: typeof fetch = async () => { throw new Error("network down"); };

    await expect(estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl })).resolves.toEqual({ status: "error", code: "provider-error" });
  });

  it("cleans up the timeout timer", async () => {
    const { estimateInventoryNutritionWithOpenAi } = await import("@/lib/openai/inventory-nutrition");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { fetchImpl } = createFetch(createJsonResponse(successfulResponseBody));

    await estimateInventoryNutritionWithOpenAi(validInput, { apiKey: "test-key", fetchImpl });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
