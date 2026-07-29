import { describe, expect, it } from "vitest";

import { buildRecipeConsumptionLines, type RecipeConsumptionInventoryItem } from "@/modules/recipes/recipe-consumption";
import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";

const ids = [
  "00000001-0001-4001-8001-000000000001",
  "00000002-0002-4002-8002-000000000002",
  "00000003-0003-4003-8003-000000000003",
  "00000004-0004-4004-8004-000000000004",
  "00000005-0005-4005-8005-000000000005",
  "00000006-0006-4006-8006-000000000006",
  "00000007-0007-4007-8007-000000000007",
  "00000008-0008-4008-8008-000000000008",
  "00000009-0009-4009-8009-000000000009",
  "0000000a-0010-4010-8010-000000000010",
  "0000000b-0011-4011-8011-000000000011",
  "0000000c-0012-4012-8012-000000000012",
  "0000000d-0013-4013-8013-000000000013",
  "0000000e-0014-4014-8014-000000000014",
  "0000000f-0015-4015-8015-000000000015",
  "00000010-0016-4016-8016-000000000016",
  "00000011-0017-4017-8017-000000000017",
  "00000012-0018-4018-8018-000000000018",
  "00000013-0019-4019-8019-000000000019",
  "00000014-0020-4020-8020-000000000020",
  "00000015-0021-4021-8021-000000000021",
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
  it("uses and sums server-calculated original quantities for measure-backed allocations", () => {
    expect(buildRecipeConsumptionLines([
      allocation({ usedQuantity: 58, usedUnit: "g", originalQuantity: 1, originalUnit: "ud", usedConfirmedUnitMeasure: true }),
      allocation({ usedQuantity: 58, usedUnit: "g", originalQuantity: 1, originalUnit: "ud", usedConfirmedUnitMeasure: true }),
    ], [item({ unit: "ud" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 2 }] });
  });
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



  it("builds twenty unique lines in stable order", () => {
    const reversedIds = ids.slice(0, 20).reverse();
    const allocations = reversedIds.map((id, index) => allocation({ inventoryItemId: id, usedQuantity: index + 1 }));
    const inventory = reversedIds.map((id) => item({ id }));
    const result = buildRecipeConsumptionLines(allocations, inventory);

    expect(result).toEqual({ ok: true, lines: ids.slice(0, 20).map((id, index) => ({ item_id: id, consumed_quantity: 20 - index })) });
  });

  it("rejects more than twenty unique products", () => {
    const allocations = ids.map((id) => allocation({ inventoryItemId: id }));
    const inventory = ids.map((id) => item({ id }));

    expect(buildRecipeConsumptionLines(allocations, inventory)).toEqual({ ok: false, code: "too-many-items" });
  });

  it("rejects an empty allocation list", () => {
    expect(buildRecipeConsumptionLines([], [item()])).toEqual({ ok: false, code: "empty" });
  });


  it("rejects a quantity converted to zero by underflow", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: Number.MIN_VALUE, usedUnit: "g" })], [item({ unit: "kg" })])).toEqual({ ok: false, code: "invalid-quantity" });
  });

  it("rejects a grouped sum that overflows to Infinity", () => {
    expect(buildRecipeConsumptionLines([
      allocation({ usedQuantity: Number.MAX_VALUE, usedUnit: "g" }),
      allocation({ usedQuantity: Number.MAX_VALUE, usedUnit: "g" }),
    ], [item({ unit: "g" })])).toEqual({ ok: false, code: "invalid-quantity" });
  });

  it("keeps normal conversion working after numeric hardening", () => {
    expect(buildRecipeConsumptionLines([allocation({ usedQuantity: 500, usedUnit: "ml" })], [item({ unit: "l" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 0.5 }] });
  });

  it("keeps normal grouping working after numeric hardening", () => {
    expect(buildRecipeConsumptionLines([
      allocation({ usedQuantity: 125, usedUnit: "g" }),
      allocation({ usedQuantity: 375, usedUnit: "g" }),
    ], [item({ unit: "kg" })])).toEqual({ ok: true, lines: [{ item_id: ids[0], consumed_quantity: 0.5 }] });
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
