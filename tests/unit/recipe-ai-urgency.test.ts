import { describe, expect, it } from "vitest";

import {
  getUrgentRecipeAiInventoryItemIds,
  hasRecipeAiUrgencyCoverage,
  sortRecipeAiSuggestionsByUrgency,
} from "@/modules/recipes/recipe-ai-urgency";
import type { RecipeAiInventoryItem, RecipeAiSuggestion } from "@/modules/recipes/recipe-ai-generation";

function item(id: string, expires_at: string | null): RecipeAiInventoryItem {
  return { id, name: id, quantity: 1, unit: "ud", category: null, expires_at };
}

function recipe(title: string, ids: string[]): RecipeAiSuggestion {
  return {
    title,
    description: "Receta temporal.",
    estimated_minutes: 15,
    servings: 1,
    ingredients: ids.map((id) => ({ inventory_item_id: id, name: id, quantity: 1, unit: "ud" })),
    steps: ["Preparar los ingredientes.", "Cocinar hasta terminar."],
  };
}

describe("getUrgentRecipeAiInventoryItemIds", () => {
  it("detects urgent products inside the inclusive seven-day window", () => {
    const inventory = [
      item("expired", "2026-07-14"),
      item("today", "2026-07-15"),
      item("tomorrow", "2026-07-16"),
      item("seven", "2026-07-22"),
      item("eight", "2026-07-23"),
      item("none", null),
    ];

    expect([...getUrgentRecipeAiInventoryItemIds(inventory, "2026-07-15")]).toEqual(["today", "tomorrow", "seven"]);
  });

  it("does not mutate inventory and is independent from local time", () => {
    const inventory = [item("today", "2026-07-15"), item("none", null)];
    const before = structuredClone(inventory);

    getUrgentRecipeAiInventoryItemIds(inventory, "2026-07-15");

    expect(inventory).toEqual(before);
  });
});

describe("hasRecipeAiUrgencyCoverage", () => {
  it("uses inventory item ids for coverage without mutating inputs", () => {
    const recipes = [recipe("Normal", ["regular"]), recipe("Urgente", ["urgent"])] as const;
    const urgentIds = new Set(["urgent"]);
    const beforeRecipes = structuredClone(recipes);
    const beforeIds = new Set(urgentIds);

    expect(hasRecipeAiUrgencyCoverage(recipes, urgentIds)).toBe(true);
    expect(hasRecipeAiUrgencyCoverage([recipe("Normal", ["regular"])], urgentIds)).toBe(false);
    expect(recipes).toEqual(beforeRecipes);
    expect(urgentIds).toEqual(beforeIds);
  });
});

describe("sortRecipeAiSuggestionsByUrgency", () => {
  const inventory = [
    item("today", "2026-07-15"),
    item("tomorrow", "2026-07-16"),
    item("week", "2026-07-22"),
    item("later", "2026-08-01"),
    item("none", null),
    item("expired", "2026-07-14"),
  ];

  it("orders by nearest expiration date", () => {
    const recipes = [recipe("Later", ["later"]), recipe("Tomorrow", ["tomorrow"]), recipe("Today", ["today"]), recipe("No date", ["none"])];

    expect(sortRecipeAiSuggestionsByUrgency(recipes, inventory, "2026-07-15").map((result) => result.title)).toEqual(["Today", "Tomorrow", "Later", "No date"]);
  });

  it("breaks ties by urgent item count and then stable provider order", () => {
    const recipes = [
      recipe("One urgent first", ["tomorrow"]),
      recipe("Two urgent", ["tomorrow", "week"]),
      recipe("One urgent second", ["tomorrow"]),
    ];

    expect(sortRecipeAiSuggestionsByUrgency(recipes, inventory, "2026-07-15").map((result) => result.title)).toEqual(["Two urgent", "One urgent first", "One urgent second"]);
  });

  it("places recipes without usable dates last and ignores expired products", () => {
    const recipes = [recipe("Expired only", ["expired"]), recipe("No date", ["none"]), recipe("Valid", ["week"])];

    expect(sortRecipeAiSuggestionsByUrgency(recipes, inventory, "2026-07-15").map((result) => result.title)).toEqual(["Valid", "Expired only", "No date"]);
  });

  it("does not mutate recipes or inventory", () => {
    const recipes = [recipe("A", ["today"]), recipe("B", ["none"]), recipe("C", ["tomorrow"])] as const;
    const recipesBefore = structuredClone(recipes);
    const inventoryBefore = structuredClone(inventory);

    sortRecipeAiSuggestionsByUrgency(recipes, inventory, "2026-07-15");

    expect(recipes).toEqual(recipesBefore);
    expect(inventory).toEqual(inventoryBefore);
  });
});
