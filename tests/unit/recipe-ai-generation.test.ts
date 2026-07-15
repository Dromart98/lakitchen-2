import { describe, expect, it, vi } from "vitest";

import { generateRecipesWithOpenAi } from "@/lib/openai/recipe-generation";
import {
  buildRecipeAiInputText,
  parseRecipeAiRequest,
  RECIPE_AI_JSON_SCHEMA,
  validateRecipeAiProviderOutput,
  type RecipeAiInventoryItem,
  type RecipeAiRequest,
} from "@/modules/recipes/recipe-ai-generation";

const request: RecipeAiRequest = { max_minutes: 30, servings: 2, suggestion_count: 2, priority_mode: "balanced" };
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


const forbiddenSchemaKeywords = ["allOf", "if", "then", "else", "not", "dependentRequired", "dependentSchemas"] as const;

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

function completed(body: unknown) {
  return { status: "completed", output_text: JSON.stringify(body) };
}

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

describe("RECIPE_AI_JSON_SCHEMA", () => {
  it("uses a strict root object without unsupported root composition", () => {
    expect(RECIPE_AI_JSON_SCHEMA.type).toBe("object");
    expect("anyOf" in RECIPE_AI_JSON_SCHEMA).toBe(false);
    expect(RECIPE_AI_JSON_SCHEMA.required).toEqual(["status", "recipes", "message"]);
  });

  it("does not contain unsupported composition keywords at any level", () => {
    walkSchema(RECIPE_AI_JSON_SCHEMA, (node) => {
      for (const keyword of forbiddenSchemaKeywords) {
        expect(node).not.toHaveProperty(keyword);
      }
    });
  });

  it("marks every object as closed and requires every declared property", () => {
    walkSchema(RECIPE_AI_JSON_SCHEMA, (node) => {
      if (node.type !== "object") return;
      expect(node.additionalProperties).toBe(false);
      const properties = node.properties as Record<string, unknown>;
      expect(new Set(node.required as string[])).toEqual(new Set(Object.keys(properties)));
    });
  });

  it("allows message to be a string or null", () => {
    expect(RECIPE_AI_JSON_SCHEMA.properties.message.type).toEqual(["string", "null"]);
  });

  it("declares the shared ingredient maximum in the JSON Schema", () => {
    const recipeItems = RECIPE_AI_JSON_SCHEMA.properties.recipes.items;
    expect(recipeItems.properties.ingredients.maxItems).toBe(20);
  });
});

describe("buildRecipeAiInputText", () => {
  it("does not include nutrition fields in the provider input text", () => {
    const inputText = buildRecipeAiInputText(request, [{
      ...inventory[0],
      nutrition_basis: "per_100g",
      calories: 350,
      protein_g: 7,
      carbs_g: 77,
      fat_g: 1.2,
    }]);

    expect(inputText).toContain("Arroz");
    expect(JSON.parse(inputText).priority_mode).toBe("balanced");
    expect(JSON.parse(inputText)).toHaveProperty("inventory");
    expect(inputText).not.toContain("nutrition_basis");
    expect(inputText).not.toContain("calories");
    expect(inputText).not.toContain("protein_g");
    expect(inputText).not.toContain("carbs_g");
    expect(inputText).not.toContain("fat_g");
  });

  it("includes deterministic server expiration context only in expiration mode", () => {
    const urgentIds = new Set(["item-2", "missing", "item-1"]);
    const before = new Set(urgentIds);
    const expirationRequest: RecipeAiRequest = { ...request, priority_mode: "expiration" };
    const parsed = JSON.parse(buildRecipeAiInputText(expirationRequest, inventory, {
      todayKey: "2026-07-15",
      urgentInventoryItemIds: urgentIds,
    }));

    expect(parsed.expiration_context).toEqual({
      today_key: "2026-07-15",
      urgent_inventory_item_ids: ["item-1", "item-2"],
    });
    expect(urgentIds).toEqual(before);
    expect(JSON.parse(buildRecipeAiInputText(request, inventory, {
      todayKey: "2026-07-15",
      urgentInventoryItemIds: urgentIds,
    }))).not.toHaveProperty("expiration_context");
  });
});

describe("parseRecipeAiRequest", () => {
  it("accepts valid selector values", () => {
    expect(parseRecipeAiRequest({ max_minutes: "15", servings: "1", suggestion_count: "1", priority_mode: "balanced" })).toEqual({ max_minutes: 15, servings: 1, suggestion_count: 1, priority_mode: "balanced" });
    expect(parseRecipeAiRequest({ max_minutes: "60", servings: "4", suggestion_count: "3", priority_mode: "expiration" })).toEqual({ max_minutes: 60, servings: 4, suggestion_count: 3, priority_mode: "expiration" });
  });

  it.each([
    { max_minutes: "10", servings: "2", suggestion_count: "1", priority_mode: "balanced" },
    { max_minutes: "30", servings: "0", suggestion_count: "1", priority_mode: "balanced" },
    { max_minutes: "30", servings: "5", suggestion_count: "1", priority_mode: "balanced" },
    { max_minutes: "30", servings: "2", suggestion_count: "4", priority_mode: "balanced" },
  ])("rejects out-of-range values %#", (input) => {
    expect(parseRecipeAiRequest(input)).toBeNull();
  });

  it.each(["1.5", "1e2", "NaN", "Infinity", "-1"])("rejects unsafe numeric string %s", (value) => {
    expect(parseRecipeAiRequest({ max_minutes: "30", servings: value, suggestion_count: "1", priority_mode: "balanced" })).toBeNull();
  });

  it("rejects additional properties", () => {
    expect(parseRecipeAiRequest({ max_minutes: "30", servings: "2", suggestion_count: "1", priority_mode: "balanced", user_id: "bad" })).toBeNull();
  });

  it.each(["today_key", "urgent_inventory_item_ids", "expiration_context"])("rejects server-only property %s", (property) => {
    expect(parseRecipeAiRequest({
      max_minutes: "30",
      servings: "2",
      suggestion_count: "1",
      priority_mode: "expiration",
      [property]: property === "today_key" ? "2026-07-15" : [],
    })).toBeNull();
  });

  it("rejects missing or unknown priority modes", () => {
    expect(parseRecipeAiRequest({ max_minutes: "30", servings: "2", suggestion_count: "1" })).toBeNull();
    expect(parseRecipeAiRequest({ max_minutes: "30", servings: "2", suggestion_count: "1", priority_mode: "urgent" })).toBeNull();
  });

});

describe("validateRecipeAiProviderOutput", () => {
  it("accepts a valid response", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [validRecipe], message: null })).toEqual({ status: "success", recipes: [validRecipe] });
  });



  it("accepts exactly twenty ingredients and rejects twenty-one", () => {
    const manyInventory = Array.from({ length: 21 }, (_, index) => ({
      id: `item-${index + 1}`,
      name: `Producto ${index + 1}`,
      quantity: 100,
      unit: "g",
      category: "other",
      expires_at: null,
    }));
    const ingredients = manyInventory.map((item) => ({ inventory_item_id: item.id, name: item.name, quantity: 1, unit: item.unit }));
    const twentyIngredientRecipe = { ...validRecipe, ingredients: ingredients.slice(0, 20) };
    const twentyOneIngredientRecipe = { ...validRecipe, ingredients };

    expect(validateRecipeAiProviderOutput(request, manyInventory, { status: "success", recipes: [twentyIngredientRecipe], message: null })).toEqual({ status: "success", recipes: [twentyIngredientRecipe] });
    expect(validateRecipeAiProviderOutput(request, manyInventory, { status: "success", recipes: [twentyOneIngredientRecipe], message: null })).toEqual({ status: "error", code: "invalid-ai-response" });
  });

  it("requires urgency coverage only in expiration mode", () => {
    const expirationRequest: RecipeAiRequest = { ...request, priority_mode: "expiration" };
    expect(validateRecipeAiProviderOutput(expirationRequest, inventory, { status: "success", recipes: [validRecipe], message: null }, new Set(["item-1"]))).toEqual({ status: "success", recipes: [validRecipe] });
    expect(validateRecipeAiProviderOutput(expirationRequest, inventory, { status: "success", recipes: [validRecipe], message: null }, new Set(["missing"]))).toEqual({ status: "error", code: "invalid-ai-response" });
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [validRecipe], message: null }, new Set(["missing"]))).toEqual({ status: "success", recipes: [validRecipe] });
  });

  it("requires a single expiration suggestion to use an urgent product", () => {
    const expirationRequest: RecipeAiRequest = { max_minutes: 30, servings: 2, suggestion_count: 1, priority_mode: "expiration" };
    expect(validateRecipeAiProviderOutput(expirationRequest, inventory, { status: "success", recipes: [validRecipe], message: null }, new Set(["item-2"]))).toEqual({ status: "success", recipes: [validRecipe] });
    expect(validateRecipeAiProviderOutput(expirationRequest, inventory, { status: "success", recipes: [validRecipe], message: null }, new Set(["urgent-missing"]))).toEqual({ status: "error", code: "invalid-ai-response" });
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
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "needs-clarification", recipes: [], message: "Necesito más productos." })).toEqual({ status: "needs-clarification", message: "Necesito más productos." });
  });

  it("rejects success without recipes", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [], message: null })).toMatchObject({ status: "error" });
  });

  it("rejects success with a message", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [validRecipe], message: "No debería aparecer." })).toMatchObject({ status: "error" });
  });

  it("rejects needs-clarification with recipes", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "needs-clarification", recipes: [validRecipe], message: "Necesito más datos." })).toMatchObject({ status: "error" });
  });

  it("rejects needs-clarification with a null message", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "needs-clarification", recipes: [], message: null })).toMatchObject({ status: "error" });
  });

  it("rejects error responses with recipes", () => {
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "error", recipes: [validRecipe], message: null })).toMatchObject({ status: "error", code: "invalid-ai-response" });
  });

  it("rejects duplicate inventory item IDs inside one recipe", () => {
    const recipe = { ...validRecipe, ingredients: [validRecipe.ingredients[0], { ...validRecipe.ingredients[0], quantity: 100 }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe], message: null })).toMatchObject({ status: "error", code: "invalid-ai-response" });
  });

  it("rejects repeated quantities that would exceed stock through duplicate IDs", () => {
    const recipe = { ...validRecipe, ingredients: [{ ...validRecipe.ingredients[1], quantity: 200 }, { ...validRecipe.ingredients[1], quantity: 200 }] };
    expect(validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [recipe], message: null })).toMatchObject({ status: "error", code: "invalid-ai-response" });
  });

  it("does not mutate inventory data", () => {
    const before = structuredClone(inventory);
    validateRecipeAiProviderOutput(request, inventory, { status: "success", recipes: [validRecipe], message: null });
    expect(inventory).toEqual(before);
  });
});

describe("generateRecipesWithOpenAi", () => {
  it("uses fetch and accepts a valid response", async () => {
    const fetchImpl = vi.fn(() => response(200, completed({ status: "success", recipes: [validRecipe], message: null })));
    await expect(generateRecipesWithOpenAi(request, inventory, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "success" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "low" });
  });

  it("sends and validates with the same server expiration context", async () => {
    const expirationRequest: RecipeAiRequest = { ...request, priority_mode: "expiration" };
    const urgentInventoryItemIds = new Set(["item-1"]);
    const fetchImpl = vi.fn(() => response(200, completed({ status: "success", recipes: [validRecipe], message: null })));

    await expect(generateRecipesWithOpenAi(expirationRequest, inventory, {
      apiKey: "key",
      fetchImpl,
      expirationContext: { todayKey: "2026-07-15", urgentInventoryItemIds },
    })).resolves.toMatchObject({ status: "success" });

    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    const providerInput = JSON.parse(body.input[1].content);
    expect(providerInput.expiration_context).toEqual({
      today_key: "2026-07-15",
      urgent_inventory_item_ids: ["item-1"],
    });
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

describe("filterUsableRecipeAiInventoryItems", () => {
  it("filters expired products before OpenAI without mutating inventory", async () => {
    const { filterUsableRecipeAiInventoryItems } = await import("@/modules/recipes/recipe-ai-generation");
    const source = [
      { id: "expired", expires_at: "2026-07-14" },
      { id: "today", expires_at: "2026-07-15" },
      { id: "none", expires_at: null },
    ];
    const before = structuredClone(source);
    expect(filterUsableRecipeAiInventoryItems(source, "2026-07-15").map((item) => item.id)).toEqual(["today", "none"]);
    expect(source).toEqual(before);
  });
});
