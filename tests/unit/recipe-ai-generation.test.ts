import { describe, expect, it, vi } from "vitest";

import { generateRecipesWithOpenAi } from "@/lib/openai/recipe-generation";
import {
  parseRecipeAiRequest,
  validateRecipeAiProviderOutput,
  type RecipeAiInventoryItem,
  type RecipeAiRequest,
} from "@/modules/recipes/recipe-ai-generation";

const request: RecipeAiRequest = { max_minutes: 30, servings: 2, suggestion_count: 2 };
const inventory: RecipeAiInventoryItem[] = [
  { id: "item-1", name: "Arroz", quantity: 500, unit: "g", category: "carb", expires_at: "2026-07-20" },
  { id: "item-2", name: "Pollo", quantity: 300, unit: "g", category: "protein", expires_at: null },
];

const validRecipe = {
  title: "Arroz con pollo",
  description: "Un plato sencillo con los productos disponibles.",
  estimated_minutes: 25,
  servings: 2,
  ingredients: [
    { inventory_item_id: "item-1", name: "Arroz", quantity: 180, unit: "g" },
    { inventory_item_id: "item-2", name: "Pollo", quantity: 220, unit: "g" },
  ],
  steps: ["Cuece el arroz hasta que quede tierno.", "Cocina el pollo y mézclalo con el arroz."],
};

function completed(body: unknown) {
  return { status: "completed", output_text: JSON.stringify(body) };
}

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

describe("parseRecipeAiRequest", () => {
  it("accepts valid selector values", () => {
    expect(parseRecipeAiRequest({ max_minutes: "15", servings: "1", suggestion_count: "1" })).toEqual({ max_minutes: 15, servings: 1, suggestion_count: 1 });
    expect(parseRecipeAiRequest({ max_minutes: "60", servings: "4", suggestion_count: "3" })).toEqual({ max_minutes: 60, servings: 4, suggestion_count: 3 });
  });

  it.each([
    { max_minutes: "10", servings: "2", suggestion_count: "1" },
    { max_minutes: "30", servings: "0", suggestion_count: "1" },
    { max_minutes: "30", servings: "5", suggestion_count: "1" },
    { max_minutes: "30", servings: "2", suggestion_count: "4" },
  ])("rejects out-of-range values %#", (input) => {
    expect(parseRecipeAiRequest(input)).toBeNull();
  });

  it.each(["1.5", "1e2", "NaN", "Infinity", "-1"])("rejects unsafe numeric string %s", (value) => {
    expect(parseRecipeAiRequest({ max_minutes: "30", servings: value, suggestion_count: "1" })).toBeNull();
  });

  it("rejects additional properties", () => {
    expect(parseRecipeAiRequest({ max_minutes: "30", servings: "2", suggestion_count: "1", user_id: "bad" })).toBeNull();
  });
});

describe("validateRecipeAiProviderOutput", () => {
  it("accepts a valid response", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [validRecipe] })).toEqual({ status: "success", recipes: [validRecipe] });
  });

  it("rejects missing IDs", () => {
    const recipe = { ...validRecipe, ingredients: [{ ...validRecipe.ingredients[0], inventory_item_id: "missing" }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe] })).toEqual({ status: "error", code: "invalid-ai-response" });
  });

  it("rejects names that do not match inventory", () => {
    const recipe = { ...validRecipe, ingredients: [{ ...validRecipe.ingredients[0], name: "Sal" }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe] })).toMatchObject({ status: "error" });
  });

  it("rejects incompatible units", () => {
    const recipe = { ...validRecipe, ingredients: [{ ...validRecipe.ingredients[0], unit: "kg" }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe] })).toMatchObject({ status: "error" });
  });

  it.each([0, -1, Infinity])("rejects invalid quantity %s", (quantity) => {
    const recipe = { ...validRecipe, ingredients: [{ ...validRecipe.ingredients[0], quantity }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe] })).toMatchObject({ status: "error" });
  });

  it("rejects quantities above stock", () => {
    const recipe = { ...validRecipe, ingredients: [{ ...validRecipe.ingredients[0], quantity: 501 }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe] })).toMatchObject({ status: "error" });
  });

  it("rejects external ingredients", () => {
    const recipe = { ...validRecipe, ingredients: [...validRecipe.ingredients, { inventory_item_id: "salt", name: "Sal", quantity: 1, unit: "g" }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe] })).toMatchObject({ status: "error" });
  });

  it("rejects recipes over time limit", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [{ ...validRecipe, estimated_minutes: 31 }] })).toMatchObject({ status: "error" });
  });

  it("rejects servings different from request", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [{ ...validRecipe, servings: 3 }] })).toMatchObject({ status: "error" });
  });

  it("rejects duplicate recipes", () => {
    expect(validateRecipeAiProviderOutput({ ...request, suggestion_count: 2 }, inventory, { status: "success", recipes: [validRecipe, { ...validRecipe }] })).toMatchObject({ status: "error" });
  });

  it.each([[[]], [["Un solo paso útil."]]] as const)("rejects invalid step count %#", (steps) => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [{ ...validRecipe, steps }] })).toMatchObject({ status: "error" });
  });

  it("rejects too many steps", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [{ ...validRecipe, steps: Array.from({ length: 13 }, (_, index) => `Paso útil número ${index + 1}.`) }] })).toMatchObject({ status: "error" });
  });

  it("handles needs-clarification", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "needs-clarification", message: "Necesito más productos." })).toEqual({ status: "needs-clarification", message: "Necesito más productos." });
  });

  it("does not mutate inventory data", () => {
    const before = structuredClone(inventory);
    validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [validRecipe] });
    expect(inventory).toEqual(before);
  });
});

describe("generateRecipesWithOpenAi", () => {
  it("uses fetch and accepts a valid response", async () => {
    const fetchImpl = vi.fn(() => response(200, completed({ status: "success", recipes: [validRecipe] })));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "success" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "low" });
  });

  it("handles incomplete responses", async () => {
    const fetchImpl = vi.fn(() => response(200, { status: "incomplete" }));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code: "incomplete-response" });
  });

  it("handles refusals", async () => {
    const fetchImpl = vi.fn(() => response(200, { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code: "refusal" });
  });

  it("handles invalid JSON", async () => {
    const fetchImpl = vi.fn(() => response(200, { status: "completed", output_text: "{" }));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code: "invalid-json" });
  });

  it.each([[408, "http-timeout"], [429, "rate-limited"], [500, "provider-error"], [503, "provider-error"]] as const)("handles HTTP %s", async (status, code) => {
    const fetchImpl = vi.fn(() => response(status, {}));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code });
  });

  it("handles timeout and clears timeout", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));

    const promise = generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ status: "error", code: "timeout" });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("handles network errors and clears timeout", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("network")));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toEqual({ status: "error", code: "network-error" });
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
