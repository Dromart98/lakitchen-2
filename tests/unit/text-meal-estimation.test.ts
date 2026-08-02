import { describe, expect, it } from "vitest";
import {
  TEXT_MEAL_AI_MODEL_DEFAULT,
  TEXT_MEAL_SYSTEM_PROMPT,
  estimateTextMealWithOpenAi,
  normalizeTextMealProviderOutput,
} from "@/lib/openai/text-meal-estimation";

const success = {
  status: "success",
  suggested_name: "Comida",
  ingredients: [
    {
      normalized_name: "arroz",
      display_name: "Arroz",
      name: "Arroz",
      confidence: "medium" as const,
      quantity: 150,
      unit: "g",
      preparation: "cocido",
      calories: 195,
      protein_g: 4,
      carbs_g: 42,
      fat_g: 0.5,
    },
  ],
  assumptions: [],
  confidence: "medium",
  message: null,
};
const clarification = {
  status: "needs-clarification",
  suggested_name: null,
  ingredients: null,
  assumptions: null,
  confidence: null,
  message: "No puedo estimar cuánto arroz se consumió aproximadamente.",
};
const response = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const completed = (output: unknown) => response(200, { status: "completed", output_text: JSON.stringify(output) });

describe("text meal OpenAI provider", () => {
  it("instructs the provider to estimate common approximate portions and apply the raw default", () => {
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("200 g de pollo debe tratarse como pollo crudo");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("100 g de arroz debe tratarse como arroz crudo");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("preparación explícita tiene prioridad");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("cantidades aproximadas");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("needs-clarification solo");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain("Si status es success, message debe ser null");
    expect(TEXT_MEAL_SYSTEM_PROMPT).toContain(
      "Si status es needs-clarification, suggested_name, ingredients, assumptions y confidence deben ser null",
    );
  });

  it("keeps the documented default model", () => {
    expect(TEXT_MEAL_AI_MODEL_DEFAULT).toBe("gpt-5.6-terra");
  });

  it("normalizes the complete Structured Output success shape", async () => {
    let body = "";
    const result = await estimateTextMealWithOpenAi("150 g arroz", {
      apiKey: "key",
      fetchImpl: async (_url, init) => {
        body = String(init?.body);
        return completed(success);
      },
    });
    expect(result).toEqual({
      status: "success",
      suggested_name: "Comida",
      ingredients: success.ingredients,
      total: { calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 },
      assumptions: [],
      confidence: "medium",
    });
    expect(body).toContain('"store":false');
    expect(body).toContain('"effort":"low"');
  });

  it("normalizes the complete Structured Output clarification shape", async () => {
    expect(
      await estimateTextMealWithOpenAi("arroz", {
        apiKey: "key",
        fetchImpl: async () => completed(clarification),
      }),
    ).toEqual({ status: "needs-clarification", message: clarification.message });
  });

  it("retries one unnecessary clarification when the description has an explicit quantity", async () => {
    const bodies: string[] = [];
    let call = 0;
    const result = await estimateTextMealWithOpenAi("100 g de plátano crudo", {
      apiKey: "key",
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body));
        call += 1;
        return call === 1 ? completed(clarification) : completed(success);
      },
    });

    expect(call).toBe(2);
    expect(result).toMatchObject({ status: "success", suggested_name: "Comida" });
    expect(bodies[1]).toContain("Segundo intento");
    expect(bodies[1]).toContain("cantidad explícita");
  });

  it("does not retry a legitimate clarification without an explicit quantity", async () => {
    let calls = 0;
    const result = await estimateTextMealWithOpenAi("arroz", {
      apiKey: "key",
      fetchImpl: async () => {
        calls += 1;
        return completed(clarification);
      },
    });

    expect(calls).toBe(1);
    expect(result).toEqual({ status: "needs-clarification", message: clarification.message });
  });

  it("retries one invalid provider payload and keeps strict validation", async () => {
    let calls = 0;
    const invalid = {
      ...success,
      ingredients: [{ ...success.ingredients[0], protein_g: -1 }],
    };
    const result = await estimateTextMealWithOpenAi("150 g arroz", {
      apiKey: "key",
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? completed(invalid) : completed(success);
      },
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({ status: "success", suggested_name: "Comida" });
  });

  it("discards only fields that are irrelevant for the provider-selected status", async () => {
    const successWithProviderMessage = { ...success, message: "Estimación orientativa lista" };
    expect(normalizeTextMealProviderOutput(successWithProviderMessage)).toEqual({
      ...successWithProviderMessage,
      message: null,
    });
    expect(
      await estimateTextMealWithOpenAi("150 g arroz", {
        apiKey: "key",
        fetchImpl: async () => completed(successWithProviderMessage),
      }),
    ).toMatchObject({ status: "success", suggested_name: "Comida" });

    const clarificationWithIrrelevantPayload = {
      ...clarification,
      suggested_name: "Ignorar",
      ingredients: success.ingredients,
      assumptions: ["Ignorar"],
      confidence: "low",
    };
    expect(normalizeTextMealProviderOutput(clarificationWithIrrelevantPayload)).toEqual({
      ...clarificationWithIrrelevantPayload,
      suggested_name: null,
      ingredients: null,
      assumptions: null,
      confidence: null,
    });
    expect(
      await estimateTextMealWithOpenAi("arroz", {
        apiKey: "key",
        fetchImpl: async () => completed(clarificationWithIrrelevantPayload),
      }),
    ).toEqual({ status: "needs-clarification", message: clarification.message });
  });

  it("still rejects invalid relevant provider payloads after the bounded retry", async () => {
    let calls = 0;
    const invalid = {
      ...success,
      ingredients: [{ ...success.ingredients[0], protein_g: -1 }],
    };
    expect(
      await estimateTextMealWithOpenAi("150 g arroz", {
        apiKey: "key",
        fetchImpl: async () => {
          calls += 1;
          return completed(invalid);
        },
      }),
    ).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(calls).toBe(2);

    expect(
      await estimateTextMealWithOpenAi("arroz", {
        apiKey: "key",
        fetchImpl: async () => completed({ ...clarification, message: null }),
      }),
    ).toEqual({ status: "error", code: "invalid-ai-response" });
  });

  it("does not retry provider failures or timeouts", async () => {
    let failures = 0;
    expect(
      await estimateTextMealWithOpenAi("150 g arroz", {
        apiKey: "key",
        fetchImpl: async () => {
          failures += 1;
          return response(500, {});
        },
      }),
    ).toEqual({ status: "error", code: "provider-error" });
    expect(failures).toBe(1);

    let timeouts = 0;
    expect(
      await estimateTextMealWithOpenAi("150 g arroz", {
        apiKey: "key",
        fetchImpl: async () => {
          timeouts += 1;
          return response(408, {});
        },
      }),
    ).toEqual({ status: "error", code: "provider-timeout" });
    expect(timeouts).toBe(1);
  });

  it("handles malformed responses with only one bounded retry", async () => {
    let malformedCalls = 0;
    expect(
      await estimateTextMealWithOpenAi("arroz", {
        apiKey: "key",
        fetchImpl: async () => {
          malformedCalls += 1;
          return response(200, { status: "completed", output_text: "no-json" });
        },
      }),
    ).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(malformedCalls).toBe(2);

    let refusalCalls = 0;
    expect(
      await estimateTextMealWithOpenAi("arroz", {
        apiKey: "key",
        fetchImpl: async () => {
          refusalCalls += 1;
          return response(200, {
            status: "completed",
            output: [{ type: "message", content: [{ type: "refusal" }] }],
          });
        },
      }),
    ).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(refusalCalls).toBe(2);
  });
});
