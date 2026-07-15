import { describe, expect, it } from "vitest";

import {
  buildCanonicalSavedAiRecipe,
  createSavedAiRecipeFingerprint,
  parseSaveGeneratedRecipeInput,
  toSavedAiRecipe,
} from "@/modules/recipes/saved-ai-recipes";

const itemA = "11111111-1111-4111-8111-111111111111";
const itemB = "22222222-2222-4222-8222-222222222222";

const validInput = {
  priority_mode: "balanced",
  recipe: {
    title: " Arroz   rápido ",
    description: "Cena   fácil",
    estimated_minutes: 20,
    servings: 2,
    ingredients: [
      { inventory_item_id: itemA, name: "Arroz", quantity: 100, unit: "g" },
      { inventory_item_id: itemB, name: "Huevo", quantity: 2, unit: "ud" },
    ],
    steps: [" Cocer   el arroz.", "Añadir huevo."],
  },
};

describe("parseSaveGeneratedRecipeInput", () => {
  it("accepts a valid saving payload", () => {
    expect(parseSaveGeneratedRecipeInput(validInput)).toMatchObject({ priority_mode: "balanced", recipe: { title: "Arroz rápido" } });
  });

  it("rejects additional properties", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, extra: true })).toBeNull();
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, extra: true } })).toBeNull();
  });

  it("rejects user_id", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, user_id: itemA })).toBeNull();
  });

  it("rejects nutrition", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, nutrition: {} } })).toBeNull();
  });

  it("rejects public fingerprint", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, fingerprint: "abc" })).toBeNull();
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, fingerprint: "abc" } })).toBeNull();
  });

  it("rejects duplicate ingredients", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, ingredients: [validInput.recipe.ingredients[0], validInput.recipe.ingredients[0]] } })).toBeNull();
  });

  it("rejects invalid quantities", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, ingredients: [{ ...validInput.recipe.ingredients[0], quantity: 0 }] } })).toBeNull();
  });

  it("rejects invalid steps", () => {
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, steps: [""] } })).toBeNull();
  });

  it("accepts exactly twenty ingredients and rejects twenty-one", () => {
    const ingredients = Array.from({ length: 21 }, (_, index) => ({
      inventory_item_id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      name: `Producto ${index + 1}`,
      quantity: 1,
      unit: "ud",
    }));

    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, ingredients: ingredients.slice(0, 20) } })?.recipe.ingredients).toHaveLength(20);
    expect(parseSaveGeneratedRecipeInput({ ...validInput, recipe: { ...validInput.recipe, ingredients } })).toBeNull();
  });
});

describe("saved AI recipe canonical fingerprint", () => {
  const parsed = parseSaveGeneratedRecipeInput(validInput)!;

  it("normalizes spaces", () => {
    expect(buildCanonicalSavedAiRecipe(parsed.recipe)).toContain("Arroz rápido");
  });

  it("uses canonical ingredient order", () => {
    const canonical = buildCanonicalSavedAiRecipe({ ...parsed.recipe, ingredients: [...parsed.recipe.ingredients].reverse() });
    expect(canonical.indexOf(itemA)).toBeLessThan(canonical.indexOf(itemB));
  });

  it("is stable for the same recipe", () => {
    expect(createSavedAiRecipeFingerprint(parsed.recipe)).toBe(createSavedAiRecipeFingerprint(parsed.recipe));
  });

  it("is identical when ingredient order changes", () => {
    expect(createSavedAiRecipeFingerprint(parsed.recipe)).toBe(createSavedAiRecipeFingerprint({ ...parsed.recipe, ingredients: [...parsed.recipe.ingredients].reverse() }));
  });

  it("changes when a quantity changes", () => {
    expect(createSavedAiRecipeFingerprint(parsed.recipe)).not.toBe(createSavedAiRecipeFingerprint({ ...parsed.recipe, ingredients: [{ ...parsed.recipe.ingredients[0], quantity: 101 }, parsed.recipe.ingredients[1]] }));
  });

  it("changes when a step changes", () => {
    expect(createSavedAiRecipeFingerprint(parsed.recipe)).not.toBe(createSavedAiRecipeFingerprint({ ...parsed.recipe, steps: ["Otro paso.", parsed.recipe.steps[1]] }));
  });

  it("does not depend on nutrition", () => {
    expect(createSavedAiRecipeFingerprint(parsed.recipe)).toBe(createSavedAiRecipeFingerprint({ ...(parsed.recipe as any), nutrition: { calories: 1 } }));
  });
});

describe("toSavedAiRecipe", () => {
  const row = {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: "44444444-4444-4444-8444-444444444444",
    title: "Arroz",
    description: "Cena",
    estimated_minutes: 20,
    servings: 2,
    steps: ["Paso uno"],
    source_priority_mode: "expiration",
    fingerprint: "abc",
    created_at: "2026-07-15T00:00:00.000Z",
    user_saved_ai_recipe_ingredients: [
      { id: "55555555-5555-4555-8555-555555555555", recipe_id: "33333333-3333-4333-8333-333333333333", user_id: "44444444-4444-4444-8444-444444444444", inventory_item_id: itemB, name: "Huevo", quantity: 2, unit: "ud", sort_order: 1, created_at: "2026-07-15T00:00:00.000Z" },
      { id: "66666666-6666-4666-8666-666666666666", recipe_id: "33333333-3333-4333-8333-333333333333", user_id: "44444444-4444-4444-8444-444444444444", inventory_item_id: itemA, name: "Arroz", quantity: 100, unit: "g", sort_order: 0, created_at: "2026-07-15T00:00:00.000Z" },
    ],
  };

  it("safely converts Supabase rows", () => {
    expect(toSavedAiRecipe(row)?.title).toBe("Arroz");
  });

  it("sorts ingredients immutably", () => {
    const original = [...row.user_saved_ai_recipe_ingredients];
    expect(toSavedAiRecipe(row)?.ingredients.map((ingredient) => ingredient.sort_order)).toEqual([0, 1]);
    expect(row.user_saved_ai_recipe_ingredients).toEqual(original);
  });

  it("safely rejects corrupt rows", () => {
    expect(toSavedAiRecipe({ ...row, steps: "bad" })).toBeNull();
  });
});
