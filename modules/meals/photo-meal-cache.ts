import { createHash } from "node:crypto";

import { validateCachedTextMealSuccess, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

export const PHOTO_MEAL_CACHE_CONTRACT_VERSION = "photo-meal-v1";
export const PHOTO_MEAL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PHOTO_MEAL_CACHE_PURGE_LIMIT = 100;

type CachedSuccess = Extract<TextMealEstimationResult, { status: "success" }>;
type CacheQuery = {
  select(columns: string): CacheQuery;
  eq(column: string, value: string): CacheQuery;
  gt(column: string, value: string): CacheQuery;
  lt(column: string, value: string): CacheQuery;
  order(column: string, options: { ascending: boolean }): CacheQuery;
  limit(count: number): PromiseLike<{ data: { id: string }[] | null; error: unknown }>;
  delete(): CacheQuery;
  in(column: string, values: string[]): PromiseLike<{ error: unknown }>;
  maybeSingle(): Promise<{ data: { result: unknown } | null; error: unknown }>;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error: unknown }>;
};
export type PhotoMealCacheClient = { from(table: "user_photo_meal_analysis_cache"): CacheQuery };

export function normalizePhotoMealCacheContext(context: string) {
  return context.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function createPhotoMealCacheKey(
  jpegBytes: Uint8Array,
  context: string,
  model: string,
  contractVersion = PHOTO_MEAL_CACHE_CONTRACT_VERSION,
) {
  const normalizedContext = normalizePhotoMealCacheContext(context);
  return createHash("sha256")
    .update(contractVersion, "utf8").update("\0")
    .update(model, "utf8").update("\0")
    .update(normalizedContext, "utf8").update("\0")
    .update(jpegBytes)
    .digest("hex");
}

export async function readPhotoMealCache(client: PhotoMealCacheClient, userId: string, cacheKey: string, now = new Date()): Promise<CachedSuccess | null> {
  const { data, error } = await client.from("user_photo_meal_analysis_cache")
    .select("result").eq("user_id", userId).eq("cache_key", cacheKey)
    .gt("expires_at", now.toISOString()).maybeSingle();
  if (error || !data) return null;
  return validateCachedTextMealSuccess(data.result);
}

export async function writePhotoMealCache(client: PhotoMealCacheClient, userId: string, cacheKey: string, model: string, result: CachedSuccess, now = new Date()) {
  const validated = validateCachedTextMealSuccess(result);
  if (!validated) return;
  await client.from("user_photo_meal_analysis_cache").upsert({
    user_id: userId,
    cache_key: cacheKey,
    model,
    contract_version: PHOTO_MEAL_CACHE_CONTRACT_VERSION,
    result: validated,
    expires_at: new Date(now.getTime() + PHOTO_MEAL_CACHE_TTL_MS).toISOString(),
  }, { onConflict: "user_id,cache_key" });
}

export async function purgeExpiredPhotoMealCache(client: PhotoMealCacheClient, now = new Date()) {
  const { data, error } = await client.from("user_photo_meal_analysis_cache")
    .select("id").lt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true }).limit(PHOTO_MEAL_CACHE_PURGE_LIMIT);
  if (error || !data?.length) return;
  await client.from("user_photo_meal_analysis_cache").delete().in("id", data.map(({ id }) => id));
}
