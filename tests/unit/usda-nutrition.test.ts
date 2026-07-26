import { describe, expect, it, vi } from "vitest";
import { lookupUsdaFood, selectUsdaCandidate } from "@/lib/nutrition/usda";

const input = { name: "Pechuga de pollo cruda", quantity: 1, unit: "kg", category: "protein" } as const;
const candidates = [
  { fdcId: 1, description: "Chicken breast, cooked, roasted", dataType: "Foundation" },
  { fdcId: 2, description: "Chicken breast, raw", dataType: "Foundation" },
  { fdcId: 3, description: "Brand chicken breast raw", dataType: "Branded" },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("USDA client and conservative selection", () => {
  it("selects a compatible raw generic candidate, never the cooked or branded first result", () => expect(selectUsdaCandidate(input, candidates)).toEqual(candidates[1]));
  it("keeps generic cheese ambiguous", () => expect(selectUsdaCandidate({ ...input, name: "Queso" }, [{ fdcId: 4, description: "Cheese, cheddar", dataType: "Foundation" }])).toBeNull());
  it("prefers cooked rice and returns complete per-100g detail", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ foods: [{ fdcId: 8, description: "Rice, white, cooked", dataType: "Foundation" }, { fdcId: 9, description: "Rice, white, raw", dataType: "Foundation" }] }))
      .mockResolvedValueOnce(json({ fdcId: 8, description: "Rice, white, cooked", dataType: "Foundation", foodNutrients: [{ nutrient: { id: 1008 }, amount: 130.5 }, { nutrient: { id: 1003 }, amount: 2.7 }, { nutrient: { id: 1005 }, amount: 28.2 }, { nutrient: { id: 1004 }, amount: 0.3 }] }));
    await expect(lookupUsdaFood({ ...input, name: "Arroz cocido" }, { apiKey: "private", fetchImpl })).resolves.toMatchObject({ status: "resolved", foodState: "cooked", calories: 130.5, nutritionBasis: "per_100g" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/foods/search?api_key=private");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("/food/8?api_key=private");
  });
  it("skips safely without a key", async () => expect(lookupUsdaFood(input, { apiKey: "" })).resolves.toEqual({ status: "unresolved", reason: "not-configured" }));
  it.each([429, 500])("falls back on HTTP %s", async (status) => expect(lookupUsdaFood(input, { apiKey: "x", fetchImpl: vi.fn(async () => json({}, status)) as typeof fetch })).resolves.toEqual({ status: "unresolved", reason: "provider-error" }));
  it("rejects incomplete nutrient details", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: [candidates[1]] })).mockResolvedValueOnce(json({ ...candidates[1], foodNutrients: [{ nutrient: { id: 1008 }, amount: 120 }] }));
    await expect(lookupUsdaFood(input, { apiKey: "x", fetchImpl })).resolves.toEqual({ status: "unresolved", reason: "provider-error" });
  });
});
