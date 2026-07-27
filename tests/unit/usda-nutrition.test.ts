import { describe, expect, it, vi } from "vitest";
import { getUsdaEnergyKcal, lookupUsdaFood, selectUsdaCandidate } from "@/lib/nutrition/usda";
import { selectUsdaCandidateWithOpenAi } from "@/lib/openai/usda-candidate-selector";

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

  it("selects raw generic food and discards cooked and branded candidates", () => expect(selectUsdaCandidate(rawInput, [cooked, branded, raw])).toEqual({ status: "selected", candidate: raw }));
  it("selects cooked rice and rejects raw rice", () => {
    const input = { ...rawInput, name: "Arroz cocido" };
    expect(selectUsdaCandidate(input, [{ fdcId: 8, description: "Rice, white, raw", dataType: "Foundation" }, { fdcId: 9, description: "Rice, white, cooked", dataType: "Foundation" }])).toMatchObject({ status: "selected", candidate: { fdcId: 9 } });
  });
  it("keeps generic cheese insufficient instead of delegating an arbitrary choice", () => expect(selectUsdaCandidate({ ...rawInput, name: "Queso" }, [{ fdcId: 4, description: "Cheese, cheddar", dataType: "Foundation" }])).toEqual({ status: "insufficient-match" }));

  it("distinguishes a bounded ambiguity containing only equally valid filtered candidates", () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({ fdcId: 20 + index, description: `Chicken breast, raw, sample ${index}`, dataType: "Foundation" }));
    const result = selectUsdaCandidate(rawInput, [...candidates, cooked, branded]);
    expect(result).toMatchObject({ status: "ambiguous" });
    if (result.status === "ambiguous") {
      expect(result.candidates).toHaveLength(5);
      expect(result.candidates.every((candidate) => candidate.dataType === "Foundation" && candidate.description.includes("raw"))).toBe(true);
    }
  });

  it("uses one structured selection call and reads macros only from the selected USDA detail", async () => {
    const first = { fdcId: 40, description: "Rice, white, cooked", dataType: "Foundation" };
    const second = { fdcId: 41, description: "Rice, brown, cooked", dataType: "SR Legacy" };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ foods: [first, second, branded] }))
      .mockResolvedValueOnce(json({ status: "completed", output_text: JSON.stringify({ status: "selected", fdc_id: 41, calories: 999 }) }))
      .mockResolvedValueOnce(json({ ...second, foodNutrients: nutrients(1008, 112) }));
    const result = await lookupUsdaFood({ ...rawInput, name: "Arroz cocido" }, { apiKey: "usda", openAiApiKey: "openai", openAiModel: "configured-model", fetchImpl });
    expect(result).toMatchObject({ status: "needs-clarification" }); // extra model property violates the strict local schema
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fetchImpl.mockReset()
      .mockResolvedValueOnce(json({ foods: [first, second, branded] }))
      .mockResolvedValueOnce(json({ status: "completed", output_text: JSON.stringify({ status: "selected", fdc_id: 41 }) }))
      .mockResolvedValueOnce(json({ ...second, foodNutrients: nutrients(1008, 112) }));
    await expect(lookupUsdaFood({ ...rawInput, name: "Arroz cocido" }, { apiKey: "usda", openAiApiKey: "openai", openAiModel: "configured-model", fetchImpl })).resolves.toMatchObject({ status: "resolved", calories: 112, proteinG: 23.4, carbsG: 0, fatG: 2.1, provenance: { source: "usda", externalId: "41" } });
    const selectorBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(selectorBody).toMatchObject({ model: "configured-model", store: false, reasoning: { effort: "low" }, max_output_tokens: 100, text: { format: { strict: true } } });
    const selectorInput = JSON.parse(selectorBody.input[1].content);
    expect(selectorInput.candidates).toEqual([first, second]);
    expect(selectorInput.candidates[0]).not.toHaveProperty("foodNutrients");
    expect(String(fetchImpl.mock.calls[2][0])).toContain("/food/41");
  });

  it.each([
    ["outside id", { status: "completed", output_text: JSON.stringify({ status: "selected", fdc_id: 999 }) }],
    ["malformed", { status: "completed", output_text: "{" }],
    ["refusal", { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }],
    ["clarification", { status: "completed", output_text: JSON.stringify({ status: "needs_clarification", fdc_id: null }) }],
  ])("returns clarification for selector %s without requesting detail", async (_case, selectorResponse) => {
    const tied = [
      { fdcId: 50, description: "Rice, white, cooked", dataType: "Foundation" },
      { fdcId: 51, description: "Rice, brown, cooked", dataType: "Foundation" },
    ];
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: tied })).mockResolvedValueOnce(json(selectorResponse));
    await expect(lookupUsdaFood({ ...rawInput, name: "Arroz cocido" }, { apiKey: "usda", openAiApiKey: "openai", fetchImpl })).resolves.toMatchObject({ status: "needs-clarification" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([429, 500])("returns clarification for selector HTTP %s", async (status) => {
    const tied = [{ fdcId: 50, description: "Rice, white, cooked", dataType: "Foundation" }, { fdcId: 51, description: "Rice, brown, cooked", dataType: "Foundation" }];
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: tied })).mockResolvedValueOnce(json({}, status));
    await expect(lookupUsdaFood({ ...rawInput, name: "Arroz cocido" }, { apiKey: "usda", openAiApiKey: "openai", fetchImpl })).resolves.toMatchObject({ status: "needs-clarification" });
  });

  it("does not select an ambiguous candidate without an OpenAI key", async () => {
    const tied = [{ fdcId: 50, description: "Rice, white, cooked", dataType: "Foundation" }, { fdcId: 51, description: "Rice, brown, cooked", dataType: "Foundation" }];
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: tied }));
    await expect(lookupUsdaFood({ ...rawInput, name: "Arroz cocido" }, { apiKey: "usda", openAiApiKey: "", fetchImpl })).resolves.toMatchObject({ status: "needs-clarification" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("turns a selector timeout into clarification", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch;
    const promise = selectUsdaCandidateWithOpenAi(rawInput, "raw", [raw, { ...raw, fdcId: 6 }], { apiKey: "openai", fetchImpl });
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(promise).resolves.toEqual({ status: "needs-clarification" });
    vi.useRealTimers();
  });

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
