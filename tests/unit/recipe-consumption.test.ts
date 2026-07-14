import { describe, expect, it } from "vitest";

import { buildRecipeConsumptionLines, type RecipeConsumptionInventoryItem } from "@/modules/recipes/recipe-consumption";
import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
  "99999999-9999-4999-8999-999999999999",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
];

function allocation(overrides: Partial<RecipeIngredientAllocation> = {}): RecipeIngredientAllocation {
  return {
    inventoryItemId: ids[0],
    inventoryItemName: "Tomate",
    usedQuantity: 100,
    usedUnit: "g",
    nutritionBasis: "per_100g",
    calories: 20,
    proteinG: 1,
    carbsG: 4,
    fatG: 0,
    ...overrides,
  };
}

function item(overrides: Partial<RecipeConsumptionInventoryItem> = {}): RecipeConsumptionInventoryItem {
  return { id: ids[0], unit: "g", ...overrides };
}

describe("buildRecipeConsumptionLines", () => {
  it("keeps grams stored as grams", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 250, usedUnit: "g" })], [item({ unit: "g" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 250 }] });
  });

  it("converts grams stored as kilograms", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 250, usedUnit: "g" })], [item({ unit: "kg" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 0.25 }] });
  });

  it("keeps milliliters stored as milliliters", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 300, usedUnit: "ml" })], [item({ unit: "ml" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 300 }] });
  });

  it("converts milliliters stored as liters", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 300, usedUnit: "ml" })], [item({ unit: "l" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 0.3 }] });
  });

  it("keeps units stored as units", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 2, usedUnit: "ud" })], [item({ unit: "ud" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 2 }] });
  });

  it("groups several allocations for the same product after converting", () => {
    const result = buildRecipeConsumptionLines([
      allocation({ usedQuantity: 250, usedUnit: "g" }),
      allocation({ usedQuantity: 150, usedUnit: "g" }),
    ], [item({ unit: "kg" })]);

    expect(result).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 0.4 }] });
  });

  it("keeps different lots with the same name separated", () => {
    const result = buildRecipeConsumptionLines([
      allocation({ inventoryItemId: ids[0], inventoryItemName: "Tomate", usedQuantity: 100 }),
      allocation({ inventoryItemId: ids[1], inventoryItemName: "Tomate", usedQuantity: 200 }),
    ], [item({ id: ids[0] }), item({ id: ids[1] })]);

    expect(result).toEqual({ ok: true, lines: [
      { item_id: ids[0], consumed_quantity: 100 },
      { item_id: ids[1], consumed_quantity: 200 },
    ] });
  });

  it("rejects missing products", () => {
    expect(buildRecipeConsumptionLines([allocation()], [])).toEqual({ ok: false, code: "missing-item" });
  });

  it("rejects incompatible units", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedUnit: "g" })], [item({ unit: "ml" })])).toEqual({ ok: false, code: "incompatible-unit" });
  });

  it("rejects zero quantity", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 0 })], [item()])).toEqual({ ok: false, code: "invalid-quantity" });
  });

  it("rejects negative quantity", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: -1 })], [item()])).toEqual({ ok: false, code: "invalid-quantity" });
  });

  it("rejects NaN", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: Number.NaN })], [item()])).toEqual({ ok: false, code: "invalid-quantity" });
  });

  it("rejects Infinity", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: Infinity })], [item()])).toEqual({ ok: false, code: "invalid-quantity" });
  });

  it("rejects more than ten unique products", () => {
    const allocations = ids.map((id) => allocation({ inventoryItemId: id }));
    const inventory = ids.map((id) => item({ id }));

    expect(buildRecipeConsumptionLines(allocations, inventory)).toEqual({ ok: false, code: "too-many-items" });
  });

  it("rejects an empty allocation list", () => {
    expect(buildRecipeConsumptionLines([], [item()])).toEqual({ ok: false, code: "empty" });
  });

  it("does not mutate inputs", () => {
    const allocations = [allocation({ usedQuantity: 250 })];
    const inventory = [item({ unit: "kg" })];
    const allocationsBefore = structuredClone(allocations);
    const inventoryBefore = structuredClone(inventory);

    buildRecipeConsumptionLines(allocations, inventory);

    expect(allocations).toEqual(allocationsBefore);
    expect(inventory).toEqual(inventoryBefore);
  });

  it("returns lines in stable deterministic item_id order", () => {
    const result = buildRecipeConsumptionLines([
      allocation({ inventoryItemId: ids[2], usedQuantity: 30 }),
      allocation({ inventoryItemId: ids[0], usedQuantity: 10 }),
      allocation({ inventoryItemId: ids[1], usedQuantity: 20 }),
    ], [item({ id: ids[2] }), item({ id: ids[0] }), item({ id: ids[1] })]);

    expect(result).toEqual({ ok: true, lines: [
      { item_id: ids[0], consumed_quantity: 10 },
      { item_id: ids[1], consumed_quantity: 20 },
      { item_id: ids[2], consumed_quantity: 30 },
    ] });
  });
});
