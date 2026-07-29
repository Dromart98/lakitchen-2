import { describe, expect, it } from "vitest";

import { selectInventoryUnitMeasures } from "@/modules/inventory/inventory-unit-equivalence";

const USER = "00000000-0000-4000-8000-000000000001";
const FOOD = "00000000-0000-4000-8000-000000000002";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    user_id: USER,
    food_catalog_item_id: FOOD,
    measure_kind: "unit",
    variant_key: "default",
    display_label: "Una unidad",
    canonical_quantity: 58,
    canonical_unit: "g",
    source: "user",
    user_confirmed: true,
    updated_at: "2026-07-29T12:00:00.000Z",
    ...overrides,
  };
}

describe("inventory confirmed unit measure selection", () => {
  it("selects one sanitized, confirmed user unit grouped by owner and identity", () => {
    expect(selectInventoryUnitMeasures([row()], USER, [FOOD]).get(FOOD)).toEqual({
      canonicalQuantity: 58,
      canonicalUnit: "g",
    });
  });

  it.each([
    ["pending proposal", row({ source: "ai", user_confirmed: false })],
    ["another owner", row({ user_id: "00000000-0000-4000-8000-000000000004" })],
    ["null identity", row({ food_catalog_item_id: null })],
    ["wrong measure kind", row({ measure_kind: "package" })],
    ["wrong dimension", row({ canonical_unit: "ud" })],
    ["invalid quantity", row({ canonical_quantity: Number.POSITIVE_INFINITY })],
  ])("ignores %s", (_name, candidate) => {
    expect(selectInventoryUnitMeasures([candidate], USER, [FOOD]).size).toBe(0);
  });

  it("fails closed when confirmed variants are ambiguous", () => {
    const second = row({
      id: "00000000-0000-4000-8000-000000000005",
      variant_key: "large",
      canonical_quantity: 80,
    });
    expect(selectInventoryUnitMeasures([row(), second], USER, [FOOD]).size).toBe(0);
  });
});
