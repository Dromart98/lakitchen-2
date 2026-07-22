import { describe, expect, it } from "vitest";

import { groupInventoryItems } from "@/modules/inventory/inventory-groups";
import type { InventoryItemRecord } from "@/modules/inventory/inventory.types";

const items: InventoryItemRecord[] = [
  {
    id: "pantry-item",
    name: "Arroz",
    location: "pantry",
    category: null,
    nutrition_basis: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    quantity: 1,
    unit: "kg",
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fridge-item",
    name: "Yogur",
    location: "fridge",
    category: null,
    nutrition_basis: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    quantity: 1,
    unit: "unit",
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "freezer-item",
    name: "Pollo",
    location: "freezer",
    category: null,
    nutrition_basis: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    quantity: 1,
    unit: "kg",
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

describe("inventory filtered groups", () => {
  it("only renders the selected location when a location filter is active", () => {
    const filteredItems = items.filter((item) => item.location === "pantry");

    expect(groupInventoryItems(filteredItems, true)).toEqual([
      expect.objectContaining({
        location: "pantry",
        items: [expect.objectContaining({ id: "pantry-item" })],
      }),
    ]);
  });

  it("only renders locations with text-search matches", () => {
    const filteredItems = items.filter((item) => item.name === "Yogur");

    expect(groupInventoryItems(filteredItems, true).map((group) => group.location)).toEqual([
      "fridge",
    ]);
  });

  it("renders no location groups when filters have no global matches", () => {
    expect(groupInventoryItems([], true)).toEqual([]);
  });

  it("keeps every location, including genuinely empty ones, without filters", () => {
    const pantryOnly = items.filter((item) => item.location === "pantry");

    expect(groupInventoryItems(pantryOnly, false).map((group) => ({
      location: group.location,
      itemCount: group.items.length,
    }))).toEqual([
      { location: "pantry", itemCount: 1 },
      { location: "fridge", itemCount: 0 },
      { location: "freezer", itemCount: 0 },
    ]);
  });
});
