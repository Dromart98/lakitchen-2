import { describe, expect, it, vi } from "vitest";
import { getUsdaEnergyKcal, lookupUsdaFood, selectUsdaCandidate } from "@/lib/nutrition/usda";

const rawInput = { name: "Pechuga de pollo cruda", quantity: 1, unit: "kg", category: "protein" } as const;
const raw = { fdcId: 2, description: "Chicken breast, raw", dataType: "Foundation" };
const cooked = { fdcId: 1, description: "Chicken breast, cooked, roasted", dataType: "Foundation" };
const branded = { fdcId: 3, description: "Brand chicken breast raw", dataType: "Branded" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const nutrients = (energyId?: number, energy = 120) => [
  ...(energyId ? [{ nutrient: { id: energyId }, amount: energy }] : []),
  { nutrient: { id: 1003 }, amount: 23.4 }, { nutrient: { id: 1005 }, amount: 0 }, { nutrient: { id: 1004 }, amount: 2.1 },
];

describe("USDA energy and conservative selection", () => {
  it("prefers modern specific-factor 2048, then general-factor 2047, then legacy 1008 without summing", () => {
    expect(getUsdaEnergyKcal([{ nutrient: { id: 1008 }, amount: 99 }, { nutrient: { id: 2047 }, amount: 110 }, { nutrient: { id: 2048 }, amount: 120 }])).toBe(120);
    expect(getUsdaEnergyKcal([{ nutrient: { id: 1008 }, amount: 99 }, { nutrient: { id: 2047 }, amount: 110 }])).toBe(110);
    expect(getUsdaEnergyKcal([{ nutrient: { id: 1008 }, amount: 99 }])).toBe(99);
  });

  it("selects raw generic food and discards cooked and branded candidates", () => expect(selectUsdaCandidate(rawInput, [cooked, branded, raw])).toEqual(raw));
  it("selects cooked rice and rejects raw rice", () => {
    const input = { ...rawInput, name: "Arroz cocido" };
    expect(selectUsdaCandidate(input, [{ fdcId: 8, description: "Rice, white, raw", dataType: "Foundation" }, { fdcId: 9, description: "Rice, white, cooked", dataType: "Foundation" }])?.fdcId).toBe(9);
  });
  it("keeps generic cheese ambiguous", () => expect(selectUsdaCandidate({ ...rawInput, name: "Queso" }, [{ fdcId: 4, description: "Cheese, cheddar", dataType: "Foundation" }])).toBeNull());

  it.each([[2047, 121.5], [2048, 119.75]] as const)("resolves modern Foundation energy %s without nutrient 1008", async (energyId, calories) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: [raw] })).mockResolvedValueOnce(json({ ...raw, foodNutrients: nutrients(energyId, calories) }));
    await expect(lookupUsdaFood(rawInput, { apiKey: "private", fetchImpl })).resolves.toMatchObject({ status: "resolved", calories, nutritionBasis: "per_100g" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("continues supporting SR Legacy energy 1008", async () => {
    const legacy = { ...raw, fdcId: 7, dataType: "SR Legacy" };
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: [legacy] })).mockResolvedValueOnce(json({ ...legacy, foodNutrients: nutrients(1008, 117.2) }));
    await expect(lookupUsdaFood(rawInput, { apiKey: "private", fetchImpl })).resolves.toMatchObject({ status: "resolved", calories: 117.2 });
  });

  it("returns a controlled unresolved result when Foundation has no compatible energy", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: [raw] })).mockResolvedValueOnce(json({ ...raw, foodNutrients: nutrients() }));
    await expect(lookupUsdaFood(rawInput, { apiKey: "private", fetchImpl })).resolves.toEqual({ status: "unresolved", reason: "provider-error" });
  });

  it("skips safely without a key", async () => expect(lookupUsdaFood(rawInput, { apiKey: "" })).resolves.toEqual({ status: "unresolved", reason: "not-configured" }));
  it.each([429, 500])("falls back on HTTP %s", async (status) => expect(lookupUsdaFood(rawInput, { apiKey: "x", fetchImpl: vi.fn(async () => json({}, status)) as typeof fetch })).resolves.toEqual({ status: "unresolved", reason: "provider-error" }));
});
