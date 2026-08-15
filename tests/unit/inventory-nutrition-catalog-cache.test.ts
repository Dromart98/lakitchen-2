import { describe, expect, it, vi } from "vitest";

import { cacheConfirmedInventoryNutrition } from "@/modules/inventory/inventory-nutrition-catalog-cache";
import { catalogRequestKey } from "@/modules/nutrition/catalog";

const completeNutrition = {
  userId: "user-a",
  name: "Arroz",
  unit: "kg",
  nutritionBasis: "per_100g" as const,
  calories: 360,
  proteinG: 7,
  carbsG: 80,
  fatG: 1,
};

describe("inventory nutrition catalog cache", () => {
  it("stops waiting when catalog persistence does not settle", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const persist = vi.fn(() => new Promise<never>(() => undefined));

    const result = cacheConfirmedInventoryNutrition({}, completeNutrition, { persist, timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith("Supabase could not update the nutrition catalog within the inventory save deadline.");
    expect(warn.mock.calls.flat()).not.toContain("Arroz");
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("returns the resolved identity while preserving submitted nutrition", async () => {
    const persist = vi.fn(async (_client, rows) => ({
      persistedCount: 1,
      foodCatalogItemIds: new Map([[
        catalogRequestKey(rows[0].normalized_name, rows[0].food_state, rows[0].nutrition_basis),
        "food-1",
      ]]),
    }));

    await expect(cacheConfirmedInventoryNutrition({}, completeNutrition, { persist, timeoutMs: 25 })).resolves.toBe("food-1");
    expect(persist.mock.calls[0][1][0]).toMatchObject({
      calories: 360,
      protein_g: 7,
      carbs_g: 80,
      fat_g: 1,
      user_confirmed: true,
    });
  });
});
