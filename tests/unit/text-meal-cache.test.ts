import { describe, expect, it, vi } from "vitest";

import {
  createTextMealCacheKey,
  normalizeTextMealCacheInput,
  readTextMealCache,
  purgeExpiredTextMealCache,
  TEXT_MEAL_CACHE_PURGE_LIMIT,
  TEXT_MEAL_CACHE_TTL_MS,
  writeTextMealCache,
  type TextMealCacheClient,
} from "@/modules/meals/text-meal-cache";
import { TEXT_MEAL_PROVIDER_CONTRACT } from "@/lib/openai/text-meal-estimation";

const result = {
  status: "success" as const,
  suggested_name: "Arroz",
  ingredients: [{ normalized_name: "arroz", display_name: "Arroz", name: "Arroz", quantity: 100, unit: "g", preparation: "cocido", confidence: "medium" as const, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }],
  total: { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 },
  assumptions: [],
  confidence: "medium" as const,
};

function query(data: { result: unknown } | null = { result }) {
  const calls: [string, unknown][] = [];
  const builder = {
    select: vi.fn(() => builder), eq: vi.fn((column: string, value: string) => { calls.push([column, value]); return builder; }),
    gt: vi.fn(() => builder), maybeSingle: vi.fn(async () => ({ data, error: null })),
    lt: vi.fn(() => builder), order: vi.fn(() => builder), limit: vi.fn(async (): Promise<{ data: { id: string }[]; error: null }> => ({ data: [], error: null })),
    delete: vi.fn(() => builder), in: vi.fn(async () => ({ error: null })),
    upsert: vi.fn(async () => ({ error: null })),
  };
  return { client: { from: vi.fn(() => builder) } as unknown as TextMealCacheClient, builder, calls };
}

describe("text meal analysis cache", () => {
  it("normalizes equivalent input and deterministically invalidates every provider contract change", () => {
    expect(normalizeTextMealCacheInput("  ARROZ\n  Cocido  ")).toBe("arroz cocido");
    const key = createTextMealCacheKey("  ARROZ\n Cocido ", "model-a", TEXT_MEAL_PROVIDER_CONTRACT);
    expect(key).toBe(createTextMealCacheKey("arroz cocido", "model-a", TEXT_MEAL_PROVIDER_CONTRACT));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("arroz");
    expect(key).not.toBe(createTextMealCacheKey("arroz crudo", "model-a", TEXT_MEAL_PROVIDER_CONTRACT));
    expect(key).not.toBe(createTextMealCacheKey("arroz cocido", "model-b", TEXT_MEAL_PROVIDER_CONTRACT));
    expect(key).not.toBe(createTextMealCacheKey("arroz cocido", "model-a", { ...TEXT_MEAL_PROVIDER_CONTRACT, systemPrompt: `${TEXT_MEAL_PROVIDER_CONTRACT.systemPrompt} cambio` }));
    expect(key).not.toBe(createTextMealCacheKey("arroz cocido", "model-a", { ...TEXT_MEAL_PROVIDER_CONTRACT, retryInstruction: `${TEXT_MEAL_PROVIDER_CONTRACT.retryInstruction} cambio` }));
    expect(key).not.toBe(createTextMealCacheKey("arroz cocido", "model-a", {
      ...TEXT_MEAL_PROVIDER_CONTRACT,
      responseFormat: { ...TEXT_MEAL_PROVIDER_CONTRACT.responseFormat, schema: { type: "object", required: ["changed"] } },
    }));
  });

  it("reads only a current entry owned by the authenticated user and validates its result", async () => {
    const valid = query();
    await expect(readTextMealCache(valid.client, "user-a", "cache-key")).resolves.toEqual(result);
    expect(valid.calls).toEqual([["user_id", "user-a"], ["cache_key", "cache-key"]]);
    const invalid = query({ result: { status: "needs-clarification", message: "Falta cantidad suficiente" } });
    await expect(readTextMealCache(invalid.client, "user-a", "cache-key")).resolves.toBeNull();
  });

  it("persists only the validated success projection and expiry metadata, never the input", async () => {
    const cache = query();
    const now = new Date("2026-08-10T00:00:00.000Z");
    await writeTextMealCache(cache.client, "user-a", "hashed-key", "model-a", TEXT_MEAL_PROVIDER_CONTRACT, result, now);
    expect(cache.builder.upsert).toHaveBeenCalledWith({
      user_id: "user-a", cache_key: "hashed-key", model: "model-a", contract_version: expect.stringMatching(/^[0-9a-f]{64}$/),
      result, expires_at: new Date(now.getTime() + TEXT_MEAL_CACHE_TTL_MS).toISOString(),
    }, { onConflict: "user_id,cache_key" });
    expect(JSON.stringify(cache.builder.upsert.mock.calls[0])).not.toContain("descripción original");
  });

  it("purges an oldest-first bounded batch of expired rows", async () => {
    const cache = query();
    cache.builder.limit.mockResolvedValue({ data: [{ id: "expired-a" }, { id: "expired-b" }], error: null });
    const now = new Date("2026-08-10T00:00:00.000Z");
    await purgeExpiredTextMealCache(cache.client, now);
    expect(cache.builder.lt).toHaveBeenCalledWith("expires_at", now.toISOString());
    expect(cache.builder.order).toHaveBeenCalledWith("expires_at", { ascending: true });
    expect(cache.builder.limit).toHaveBeenCalledWith(TEXT_MEAL_CACHE_PURGE_LIMIT);
    expect(cache.builder.delete).toHaveBeenCalledOnce();
    expect(cache.builder.in).toHaveBeenCalledWith("id", ["expired-a", "expired-b"]);
  });
});
