import { createHash } from "node:crypto";

import { validateCachedTextMealSuccess, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

function fingerprintContract(contract: unknown) {
  return createHash("sha256").update(JSON.stringify(contract), "utf8").digest("hex");
}

export const TEXT_MEAL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
export type TextMealCacheClient = { from(table: "user_text_meal_analysis_cache"): CacheQuery };
export const TEXT_MEAL_CACHE_PURGE_LIMIT = 100;

export function normalizeTextMealCacheInput(description: string) {
  return description.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function createTextMealCacheKey(description: string, model: string, contract: unknown) {
  return createHash("sha256")
    .update(`${fingerprintContract(contract)}\0${model}\0${normalizeTextMealCacheInput(description)}`, "utf8")
    .digest("hex");
}

export async function readTextMealCache(client: TextMealCacheClient, userId: string, cacheKey: string, now = new Date()): Promise<CachedSuccess | null> {
  const { data, error } = await client.from("user_text_meal_analysis_cache")
    .select("result")
    .eq("user_id", userId)
    .eq("cache_key", cacheKey)
    .gt("expires_at", now.toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return validateCachedTextMealSuccess(data.result);
}

export async function writeTextMealCache(client: TextMealCacheClient, userId: string, cacheKey: string, model: string, contract: unknown, result: CachedSuccess, now = new Date()) {
  await client.from("user_text_meal_analysis_cache").upsert({
    user_id: userId,
    cache_key: cacheKey,
    model,
    contract_version: fingerprintContract(contract),
    result,
    expires_at: new Date(now.getTime() + TEXT_MEAL_CACHE_TTL_MS).toISOString(),
  }, { onConflict: "user_id,cache_key" });
}

export async function purgeExpiredTextMealCache(client: TextMealCacheClient, now = new Date()) {
  const { data, error } = await client.from("user_text_meal_analysis_cache")
    .select("id")
    .lt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(TEXT_MEAL_CACHE_PURGE_LIMIT);
  if (error || !data?.length) return;
  await client.from("user_text_meal_analysis_cache").delete().in("id", data.map(({ id }) => id));
}
