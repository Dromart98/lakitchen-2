import { describe, expect, it, vi } from "vitest";

import {
  createPhotoMealCacheKey, normalizePhotoMealCacheContext,
  PHOTO_MEAL_CACHE_PURGE_LIMIT, PHOTO_MEAL_CACHE_TTL_MS, purgeExpiredPhotoMealCache,
  readPhotoMealCache, writePhotoMealCache, type PhotoMealCacheClient,
} from "@/modules/meals/photo-meal-cache";
import { PHOTO_MEAL_PROVIDER_CONTRACT } from "@/lib/openai/photo-meal-estimation";

const result = {
  status: "success" as const, suggested_name: "Arroz",
  ingredients: [{ normalized_name: "arroz", display_name: "Arroz", name: "Arroz", quantity: 100, unit: "g", preparation: "cocido", confidence: "medium" as const, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }],
  total: { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }, assumptions: [], confidence: "medium" as const,
};

function query(data: { result: unknown } | null = { result }) {
  const calls: [string, unknown][] = [];
  const builder = {
    select: vi.fn(() => builder), eq: vi.fn((column: string, value: string) => { calls.push([column, value]); return builder; }),
    gt: vi.fn(() => builder), maybeSingle: vi.fn(async () => ({ data, error: null })),
    lt: vi.fn(() => builder), order: vi.fn(() => builder), limit: vi.fn(async () => ({ data: [] as { id: string }[], error: null })),
    delete: vi.fn(() => builder), in: vi.fn(async () => ({ error: null })), upsert: vi.fn(async () => ({ error: null })),
  };
  return { client: { from: vi.fn(() => builder) } as unknown as PhotoMealCacheClient, builder, calls };
}

describe("photo meal analysis cache", () => {
  it("hashes exact JPEG bytes and deterministically invalidates provider contract changes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1]);
    expect(normalizePhotoMealCacheContext("  POLLO\n asado  ")).toBe("pollo asado");
    const key = createPhotoMealCacheKey(bytes, "  POLLO\n asado ", "model-a", PHOTO_MEAL_PROVIDER_CONTRACT);
    expect(key).toBe(createPhotoMealCacheKey(bytes, "pollo asado", "model-a", PHOTO_MEAL_PROVIDER_CONTRACT));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(createPhotoMealCacheKey(new Uint8Array([0xff, 0xd8, 0xff, 2]), "pollo asado", "model-a", PHOTO_MEAL_PROVIDER_CONTRACT));
    expect(key).not.toBe(createPhotoMealCacheKey(bytes, "pollo cocido", "model-a", PHOTO_MEAL_PROVIDER_CONTRACT));
    expect(key).not.toBe(createPhotoMealCacheKey(bytes, "pollo asado", "model-b", PHOTO_MEAL_PROVIDER_CONTRACT));
    expect(key).not.toBe(createPhotoMealCacheKey(bytes, "pollo asado", "model-a", { ...PHOTO_MEAL_PROVIDER_CONTRACT, systemPrompt: `${PHOTO_MEAL_PROVIDER_CONTRACT.systemPrompt} cambio` }));
    expect(key).not.toBe(createPhotoMealCacheKey(bytes, "pollo asado", "model-a", {
      ...PHOTO_MEAL_PROVIDER_CONTRACT,
      responseFormat: { ...PHOTO_MEAL_PROVIDER_CONTRACT.responseFormat, schema: { type: "object", required: ["changed"] } },
    }));
  });

  it("reads a fresh same-user row and rejects a non-success projection", async () => {
    const valid = query();
    await expect(readPhotoMealCache(valid.client, "user-a", "hash")).resolves.toEqual(result);
    expect(valid.calls).toEqual([["user_id", "user-a"], ["cache_key", "hash"]]);
    const invalid = query({ result: { status: "needs-clarification", message: "No se distingue la comida." } });
    await expect(readPhotoMealCache(invalid.client, "user-a", "hash")).resolves.toBeNull();
  });

  it("persists only a revalidated success projection and no image or context", async () => {
    const cache = query();
    const now = new Date("2026-08-10T00:00:00.000Z");
    await writePhotoMealCache(cache.client, "user-a", "hash", "model-a", PHOTO_MEAL_PROVIDER_CONTRACT, result, now);
    expect(cache.builder.upsert).toHaveBeenCalledWith({
      user_id: "user-a", cache_key: "hash", model: "model-a", contract_version: expect.stringMatching(/^[0-9a-f]{64}$/),
      result, expires_at: new Date(now.getTime() + PHOTO_MEAL_CACHE_TTL_MS).toISOString(),
    }, { onConflict: "user_id,cache_key" });
    expect(JSON.stringify(cache.builder.upsert.mock.calls[0])).not.toMatch(/base64|image|context|pollo asado/i);
    await writePhotoMealCache(cache.client, "user-a", "hash", "model-a", PHOTO_MEAL_PROVIDER_CONTRACT, { ...result, total: { ...result.total, calories: 999 } });
    expect(cache.builder.upsert).toHaveBeenCalledTimes(1);
  });

  it("purges an oldest-first bounded batch", async () => {
    const cache = query();
    cache.builder.limit.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null });
    const now = new Date("2026-08-10T00:00:00.000Z");
    await purgeExpiredPhotoMealCache(cache.client, now);
    expect(cache.builder.lt).toHaveBeenCalledWith("expires_at", now.toISOString());
    expect(cache.builder.order).toHaveBeenCalledWith("expires_at", { ascending: true });
    expect(cache.builder.limit).toHaveBeenCalledWith(PHOTO_MEAL_CACHE_PURGE_LIMIT);
    expect(cache.builder.in).toHaveBeenCalledWith("id", ["a", "b"]);
  });
});
