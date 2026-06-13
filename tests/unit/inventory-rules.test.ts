import { describe, expect, it } from "vitest";
import { consumeInventory, getExpiringItems } from "@/modules/inventory/inventory.rules";
import type { InventoryItem } from "@/modules/inventory/inventory.types";
const item: InventoryItem = { id: "a", name: "Yogur", location: "fridge", category: "dairy protein", quantity: 2, unit: "unit", expirationDate: "2026-06-15", status: "available", calories: 60, proteinG: 10, carbsG: 4, fatG: 0 };
describe("inventory rules", () => { it("finds expiring available items", () => { expect(getExpiringItems([item], 3, new Date("2026-06-13T00:00:00Z"))).toHaveLength(1); }); it("marks consumed when quantity reaches zero", () => { expect(consumeInventory(item, 2).status).toBe("consumed"); }); });
