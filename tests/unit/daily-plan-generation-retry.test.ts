import { describe, expect, it, vi } from "vitest";

import {
  generateDailyPlanWithOpenAi,
  normalizeDailyPlanProviderOutput,
} from "@/lib/openai/daily-plan-generation";
import type {
  DailyPlanInventoryItem,
  DailyPlanPublicRequest,
} from "@/modules/plans/daily-plan-ai";

const request: DailyPlanPublicRequest = {
  plan_date: "2026-08-01",
  priority_mode: "balanced",
  max_minutes_per_meal: 30,
};

const inventory: DailyPlanInventoryItem[] = [
  { id: "oats", name: "Avena", quantity: 1000, unit: "g", expires_at: null, category: null, nutrition_basis: "per_100g", calories: 380, protein_g: 13, carbs_g: 60, fat_g: 7 },
  { id: "yogurt", name: "Yogur", quantity: 1000, unit: "g", expires_at: null, category: null, nutrition_basis: "per_100g", calories: 63, protein_g: 5, carbs_g: 7, fat_g: 1.5 },
];

function validOutput() {
  return {
    status: "success",
    message: null as string | null,
    meals: [
      { meal_type: "breakfast", title: "Avena de desayuno", description: "Desayuno sencillo con avena.", estimated_minutes: 10, ingredients: [{ inventory_item_id: "oats", name: "Avena", quantity: 100, unit: "g" }], steps: ["Pon la avena en un bol limpio.", "Sirve la avena cuando esté preparada."] },
      { meal_type: "lunch", title: "Avena con yogur", description: "Comida rápida con ambos productos.", estimated_minutes: 10, ingredients: [{ inventory_item_id: "oats", name: "Avena", quantity: 150, unit: "g" }, { inventory_item_id: "yogurt", name: "Yogur", quantity: 200, unit: "g" }], steps: ["Mezcla la avena con el yogur despacio.", "Sirve la mezcla en un recipiente limpio."] },
      { meal_type: "snack", title: "Yogur de merienda", description: "Merienda sencilla de yogur.", estimated_minutes: 5, ingredients: [{ inventory_item_id: "yogurt", name: "Yogur", quantity: 150, unit: "g" }], steps: ["Pon el yogur en un cuenco limpio.", "Sirve el yogur directamente en el cuenco."] },
      { meal_type: "dinner", title: "Avena nocturna", description: "Cena sencilla basada en avena.", estimated_minutes: 10, ingredients: [{ inventory_item_id: "oats", name: "Avena", quantity: 100, unit: "g" }], steps: ["Prepara la avena en un recipiente limpio.", "Sirve la avena cuando esté lista para comer."] },
    ],
  };
}

function completed(output: unknown) {
  return { status: "completed", error: null, output_text: JSON.stringify(output) };
}

function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

describe("daily plan provider recovery", () => {
  it("normalizes only status-dependent fields before strict validation", async () => {
    const output = validOutput();
    output.message = "Plan generado";
    const fetchImpl = vi.fn(() => response(completed(output)));

    await expect(generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, request.plan_date, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "success" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(normalizeDailyPlanProviderOutput({ status: "success", message: "x", meals: [] })).toEqual({ status: "success", message: null, meals: [] });
  });

  it("retries once when a schema-shaped plan fails semantic validation", async () => {
    const invalid = validOutput();
    invalid.meals = [...invalid.meals].reverse();
    const fetchImpl = vi.fn().mockImplementationOnce(() => response(completed(invalid))).mockImplementationOnce(() => response(completed(validOutput())));

    await expect(generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, request.plan_date, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "success" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(secondBody.input[0].content).toContain("REINTENTO DE VALIDACIÓN");
  });

  it("does not retry provider failures", async () => {
    const fetchImpl = vi.fn(() => response({ error: { message: "provider down" } }, 500));

    await expect(generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, request.plan_date, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code: "provider-error" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
