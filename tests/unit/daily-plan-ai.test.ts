import { afterEach, describe, expect, it, vi } from "vitest";

import { generateDailyPlanWithOpenAi } from "@/lib/openai/daily-plan-generation";
import {
  buildDailyPlanInputText,
  buildDailyPlanTarget,
  buildUsableDailyPlanInventoryItems,
  getDailyPlanInventoryReadiness,
  DAILY_PLAN_JSON_SCHEMA,
  dailyPlanPublicRequestSchema,
  enrichDailyPlanWithDeterministicNutrition,
  evaluateDailyPlanFit,
  validateDailyPlanProviderOutput,
  type DailyPlanInventoryItem,
  type DailyPlanPublicRequest,
} from "@/modules/plans/daily-plan-ai";

const request: DailyPlanPublicRequest = { plan_date: "2026-07-15", priority_mode: "balanced", max_minutes_per_meal: 30 };
const todayKey = "2026-07-15";

const inventory: DailyPlanInventoryItem[] = [
  { id: "oats", name: "Avena", quantity: 500, unit: "g", expires_at: "2026-07-30", category: "carbohydrate", nutrition_basis: "per_100g", calories: 380, protein_g: 13, carbs_g: 60, fat_g: 7 },
  { id: "yogurt", name: "Yogur", quantity: 400, unit: "g", expires_at: "2026-07-15", category: "dairy", nutrition_basis: "per_100g", calories: 60, protein_g: 10, carbs_g: 4, fat_g: 1 },
  { id: "rice", name: "Arroz", quantity: 300, unit: "g", expires_at: null, category: "carbohydrate", nutrition_basis: "per_100g", calories: 350, protein_g: 7, carbs_g: 78, fat_g: 1 },
  { id: "chicken", name: "Pollo", quantity: 500, unit: "g", expires_at: "2026-07-30", category: "protein", nutrition_basis: "per_100g", calories: 120, protein_g: 23, carbs_g: 0, fat_g: 2 },
  { id: "apple", name: "Manzana", quantity: 2, unit: "ud", expires_at: null, category: "fruit", nutrition_basis: "per_unit", calories: 80, protein_g: 0.4, carbs_g: 20, fat_g: 0.2 },
];

function validOutput() {
  return {
    status: "success",
    message: null,
    meals: [
      { meal_type: "breakfast", title: "Avena con yogur", description: "Bol sencillo.", estimated_minutes: 10, ingredients: [{ inventory_item_id: "oats", name: "Avena", quantity: 60, unit: "g" }, { inventory_item_id: "yogurt", name: "Yogur", quantity: 150, unit: "g" }], steps: ["Mezcla la avena con el yogur.", "Sirve en un bol y deja reposar."] },
      { meal_type: "lunch", title: "Pollo con arroz", description: "Plato completo.", estimated_minutes: 30, ingredients: [{ inventory_item_id: "chicken", name: "Pollo", quantity: 250, unit: "g" }, { inventory_item_id: "rice", name: "Arroz", quantity: 120, unit: "g" }], steps: ["Cocina el arroz hasta que esté tierno.", "Cocina el pollo y sirve junto al arroz."] },
      { meal_type: "snack", title: "Yogur con manzana", description: "Merienda rápida.", estimated_minutes: 5, ingredients: [{ inventory_item_id: "apple", name: "Manzana", quantity: 1, unit: "ud" }, { inventory_item_id: "yogurt", name: "Yogur", quantity: 100, unit: "g" }], steps: ["Corta la manzana en trozos.", "Acompaña con el yogur."] },
      { meal_type: "dinner", title: "Arroz con pollo", description: "Cena sencilla.", estimated_minutes: 25, ingredients: [{ inventory_item_id: "chicken", name: "Pollo", quantity: 200, unit: "g" }, { inventory_item_id: "rice", name: "Arroz", quantity: 100, unit: "g" }], steps: ["Calienta el arroz cocido.", "Cocina el pollo y mezcla antes de servir."] },
    ],
  };
}

function completed(body: unknown) {
  return { status: "completed", error: null, output_text: JSON.stringify(body) };
}

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

function walkSchema(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkSchema(item, visit));
    return;
  }
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((child) => walkSchema(child, visit));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("daily plan AI", () => {
  it("accepts only the exact public request fields", () => {
    expect(dailyPlanPublicRequestSchema.safeParse(request).success).toBe(true);
    expect(dailyPlanPublicRequestSchema.safeParse({ ...request, user_id: "bad" }).success).toBe(false);
    expect(dailyPlanPublicRequestSchema.safeParse({ ...request, target: { calories: 2000 } }).success).toBe(false);
    expect(dailyPlanPublicRequestSchema.safeParse({ ...request, max_minutes_per_meal: 20 }).success).toBe(false);
  });

  it("builds valid nutrition targets", () => {
    expect(buildDailyPlanTarget({ target_calories: 2000, target_protein_g: 120, target_carbs_g: 220, target_fat_g: 60 })).toEqual({ calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 });
    expect(buildDailyPlanTarget({ target_calories: 0, target_protein_g: 120, target_carbs_g: 220, target_fat_g: 60 })).toBeNull();
  });

  it("uses a strict Structured Output schema with the shared ingredient limit", () => {
    expect(DAILY_PLAN_JSON_SCHEMA.type).toBe("object");
    expect(DAILY_PLAN_JSON_SCHEMA.required).toEqual(["status", "message", "meals"]);
    expect(DAILY_PLAN_JSON_SCHEMA.properties.meals.items.properties.ingredients.maxItems).toBe(20);
    walkSchema(DAILY_PLAN_JSON_SCHEMA, (node) => {
      if (node.type !== "object") return;
      expect(node.additionalProperties).toBe(false);
      expect(new Set(node.required as string[])).toEqual(new Set(Object.keys(node.properties as Record<string, unknown>)));
    });
  });

  it("filters expired, incomplete and incompatible inventory without mutating source", () => {
    const source = [
      ...inventory,
      { id: "expired", name: "Viejo", quantity: 1, unit: "ud", expires_at: "2026-07-14", category: null, nutrition_basis: "per_unit", calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 },
      { id: "bad", name: "Malo", quantity: 1, unit: "g", expires_at: null, category: null, nutrition_basis: "per_100ml", calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 },
      { id: "missing", name: "Sin macros", quantity: 1, unit: "ud", expires_at: null, category: null, nutrition_basis: "per_unit", calories: null, protein_g: 1, carbs_g: 1, fat_g: 1 },
    ];
    const result = buildUsableDailyPlanInventoryItems(source, todayKey);
    expect(result.map((item) => item.id)).not.toContain("expired");
    expect(result.map((item) => item.id)).not.toContain("bad");
    expect(result.map((item) => item.id)).not.toContain("missing");
    expect(source.at(-1)?.id).toBe("missing");
  });

  it("classifies inventory readiness with the generator's exact rules", () => {
    const base = { quantity: 1, expires_at: null, category: null, calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 };
    const items = [
      { ...base, id: "g", name: "Gramos", unit: "g", nutrition_basis: "per_100g" },
      { ...base, id: "ml", name: "Mililitros", unit: "ml", nutrition_basis: "per_100ml" },
      { ...base, id: "unit", name: "Unidad", unit: "ud", nutrition_basis: "per_unit" },
      { ...base, id: "incomplete", name: "Incompleto", unit: "g", nutrition_basis: "per_100g", fat_g: null },
      { ...base, id: "basis", name: "Sin base", unit: "g", nutrition_basis: null },
      { ...base, id: "unit-bad", name: "Unidad incompatible", unit: "ml", nutrition_basis: "per_100g" },
      { ...base, id: "zero", name: "Agotado", quantity: 0, unit: "g", nutrition_basis: "per_100g" },
      { ...base, id: "expired", name: "Caducado", expires_at: "2026-07-14", unit: "g", nutrition_basis: "per_100g" },
    ];
    const readiness = getDailyPlanInventoryReadiness(items, todayKey);
    expect(readiness.usable.map(({ id }) => id)).toEqual(["g", "ml", "unit"]);
    expect(Object.fromEntries(readiness.excluded.map(({ item, reason }) => [item.id, reason]))).toEqual({
      incomplete: "incomplete-nutrition", basis: "missing-nutrition-basis", "unit-bad": "incompatible-unit", zero: "non-positive-quantity", expired: "expired",
    });
    expect(readiness).toMatchObject({ availableCount: 7, canGenerate: true, hasLimitedVariety: true });
  });

  it("summarizes two usable products and blocks fewer than two", () => {
    expect(getDailyPlanInventoryReadiness(inventory.slice(0, 2), todayKey)).toMatchObject({ availableCount: 2, canGenerate: true, hasLimitedVariety: true });
    expect(getDailyPlanInventoryReadiness(inventory.slice(0, 1), todayKey)).toMatchObject({ availableCount: 1, canGenerate: false, hasLimitedVariety: false });
  });

  it("validates four ordered meal types and accumulated daily stock", () => {
    expect(validateDailyPlanProviderOutput(request, inventory, validOutput(), todayKey).status).toBe("success");
    const tooMuch = validOutput();
    tooMuch.meals[3].ingredients[0].quantity = 260;
    expect(validateDailyPlanProviderOutput(request, inventory, tooMuch, todayKey)).toEqual({ status: "error", code: "invalid-ai-response" });
    const wrongOrder = validOutput();
    wrongOrder.meals.reverse();
    expect(validateDailyPlanProviderOutput(request, inventory, wrongOrder, todayKey)).toEqual({ status: "error", code: "invalid-ai-response" });
  });

  it("requires urgent coverage in expiration mode", () => {
    const noUrgent = validOutput();
    noUrgent.meals[0].ingredients = [{ inventory_item_id: "oats", name: "Avena", quantity: 60, unit: "g" }];
    noUrgent.meals[2].ingredients = [{ inventory_item_id: "apple", name: "Manzana", quantity: 1, unit: "ud" }];
    expect(validateDailyPlanProviderOutput({ plan_date: "2026-07-15", priority_mode: "expiration", max_minutes_per_meal: 30 }, inventory, noUrgent, todayKey)).toEqual({ status: "error", code: "invalid-ai-response" });
  });

  it("calculates nutrition deterministically from inventory", () => {
    const validated = validateDailyPlanProviderOutput(request, inventory, validOutput(), todayKey);
    expect(validated.status).toBe("success");
    if (validated.status !== "success") return;
    const enriched = enrichDailyPlanWithDeterministicNutrition(validated.meals, inventory, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 });
    expect(enriched.status).toBe("success");
    if (enriched.status !== "success") return;
    const sum = enriched.meals.reduce((acc, meal) => acc + meal.nutrition.calories, 0);
    expect(enriched.total.calories).toBeCloseTo(sum);
    expect(enriched.difference.calories).toBeCloseTo(enriched.total.calories - 2000);
  });

  it("builds a minimal OpenAI payload and evaluates fit", () => {
    const payload = JSON.parse(buildDailyPlanInputText({ plan_date: "2026-07-15", priority_mode: "expiration", max_minutes_per_meal: 45 }, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, todayKey));
    expect(payload.target).toEqual({ calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 });
    expect(payload.inventory[0]).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), quantity: expect.any(Number), unit: expect.any(String), expires_at: expect.anything(), category: expect.anything(), nutrition_basis: expect.any(String), calories: expect.any(Number), protein_g: expect.any(Number), carbs_g: expect.any(Number), fat_g: expect.any(Number) }));
    expect(payload.user_id).toBeUndefined();
    expect(evaluateDailyPlanFit({ calories: 2050, protein_g: 110 }, { calories: 2000, protein_g: 120 })).toBe("close");
    expect(evaluateDailyPlanFit({ calories: 2300, protein_g: 95 }, { calories: 2000, protein_g: 120 })).toBe("acceptable");
    expect(evaluateDailyPlanFit({ calories: 2600, protein_g: 70 }, { calories: 2000, protein_g: 120 })).toBe("far");
  });
});

describe("generateDailyPlanWithOpenAi", () => {
  it("uses the Responses API securely and accepts error:null", async () => {
    const fetchImpl = vi.fn(() => response(200, completed(validOutput())));
    await expect(generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, todayKey, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "success" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
  });

  it("sends the server expiration context in expiration mode", async () => {
    const expirationRequest: DailyPlanPublicRequest = { plan_date: "2026-07-15", priority_mode: "expiration", max_minutes_per_meal: 30 };
    const fetchImpl = vi.fn(() => response(200, completed(validOutput())));
    await expect(generateDailyPlanWithOpenAi(expirationRequest, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, todayKey, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "success" });
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    const providerInput = JSON.parse(body.input[1].content);
    expect(providerInput.expiration_context).toEqual({ reference_date: todayKey, urgent_inventory_item_ids: ["yogurt"] });
  });

  it.each([[408, "provider-timeout"], [429, "provider-error"], [500, "provider-error"], [503, "provider-error"]] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetchImpl = vi.fn(() => response(status, {}));
    await expect(generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, todayKey, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code });
  });

  it("rejects provider errors, incomplete responses and invalid JSON", async () => {
    const target = { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 };
    await expect(generateDailyPlanWithOpenAi(request, target, inventory, todayKey, { apiKey: "key", fetchImpl: vi.fn(() => response(200, { status: "completed", error: { message: "bad" } })) })).resolves.toEqual({ status: "error", code: "provider-error" });
    await expect(generateDailyPlanWithOpenAi(request, target, inventory, todayKey, { apiKey: "key", fetchImpl: vi.fn(() => response(200, { status: "incomplete", error: null })) })).resolves.toEqual({ status: "error", code: "invalid-ai-response" });
    await expect(generateDailyPlanWithOpenAi(request, target, inventory, todayKey, { apiKey: "key", fetchImpl: vi.fn(() => response(200, { status: "completed", error: null, output_text: "{" })) })).resolves.toEqual({ status: "error", code: "invalid-ai-response" });
  });

  it("handles timeout and always clears the timer", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const promise = generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, todayKey, { apiKey: "key", fetchImpl });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ status: "error", code: "provider-timeout" });
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("maps network failures safely and clears the timer", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("network")));
    await expect(generateDailyPlanWithOpenAi(request, { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }, inventory, todayKey, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code: "provider-error" });
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
