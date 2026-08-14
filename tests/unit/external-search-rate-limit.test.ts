import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  createExternalSearchFetch,
  EXTERNAL_SEARCH_REQUEST_LIMIT_FALLBACK,
  EXTERNAL_SEARCH_WINDOW_SECONDS_FALLBACK,
  getExternalSearchRequestLimit,
  getExternalSearchWindowSeconds,
} from "@/lib/server/external-search-rate-limit";
import { lookupUsdaFood } from "@/lib/nutrition/usda";
import { lookupOpenFoodFactsProduct } from "@/lib/nutrition/open-food-facts";
import { resolveInventoryNutritionForUser } from "@/lib/nutrition/catalog-resolver";

const migration = readFileSync("supabase/migrations/20260814000000_create_external_search_request_usage.sql", "utf8").toLowerCase();
const usdaInput = { name: "Pechuga de pollo cruda", quantity: 1, unit: "kg", category: "protein" } as const;

function slidingClient(now: () => number) {
  const requests = new Map<string, number[]>();
  return {
    requests,
    rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const user = String(args.p_user_id);
      const current = now();
      const windowMs = Number(args.p_window_seconds) * 1_000;
      const limit = Number(args.p_limit);
      const recent = (requests.get(user) ?? []).filter((value) => value > current - windowMs);
      if (recent.length >= limit) return { data: { allowed: false, retry_after_seconds: 1 }, error: null };
      requests.set(user, [...recent, current]);
      return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
    }),
  };
}

const provider = vi.fn(async () => Response.json({}));
const search = (userId: string, client: ReturnType<typeof slidingClient>) =>
  createExternalSearchFetch({ userId, client, baseFetch: provider })("https://world.openfoodfacts.org/api/v3/product/1");

describe("external search guard", () => {
  it("uses independent validated server-side settings", () => {
    expect(getExternalSearchRequestLimit("12")).toBe(12);
    expect(getExternalSearchRequestLimit("0")).toBe(EXTERNAL_SEARCH_REQUEST_LIMIT_FALLBACK);
    expect(getExternalSearchWindowSeconds("90")).toBe(90);
    expect(getExternalSearchWindowSeconds("bad")).toBe(EXTERNAL_SEARCH_WINDOW_SECONDS_FALLBACK);
  });

  it("allows ten requests, blocks the next, recovers after 60 seconds, and isolates users", async () => {
    let now = 0;
    const client = slidingClient(() => now);
    provider.mockClear();
    for (let index = 0; index < 10; index += 1) expect((await search("user-a", client)).status).toBe(200);
    expect((await search("user-a", client)).status).toBe(429);
    expect((await search("user-b", client)).status).toBe(200);
    now = 60_001;
    expect((await search("user-a", client)).status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(12);
  });

  it("does not exceed the threshold under concurrent reservations", async () => {
    const client = slidingClient(() => 0);
    provider.mockClear();
    const responses = await Promise.all(Array.from({ length: 11 }, () => search("user-a", client)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(10);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
  });

  it("fails closed without exposing storage errors", async () => {
    const fetchImpl = createExternalSearchFetch({
      userId: "user-a",
      client: { rpc: vi.fn(async () => ({ data: null, error: { message: "private" } })) },
      baseFetch: provider,
    });
    const response = await fetchImpl("https://api.nal.usda.gov/fdc/v1/foods/search");
    expect(response.status).toBe(429);
    expect(response.headers.get("x-lakitchen-external-search")).toBe("unavailable");
  });

  it("reserves once for the USDA search plus detail logical lookup", async () => {
    const client = slidingClient(() => 0);
    const raw = { fdcId: 2, description: "Chicken breast, raw", dataType: "Foundation" };
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ foods: [raw] }))
      .mockResolvedValueOnce(Response.json({ ...raw, foodNutrients: [
        { nutrient: { id: 2048 }, amount: 120 }, { nutrient: { id: 1003 }, amount: 23 },
        { nutrient: { id: 1005 }, amount: 0 }, { nutrient: { id: 1004 }, amount: 2 },
      ] }));
    const fetchImpl = createExternalSearchFetch({ userId: "user-a", client, baseFetch });
    await expect(lookupUsdaFood(usdaInput, { apiKey: "key", fetchImpl })).resolves.toMatchObject({ status: "resolved" });
    expect(client.rpc).toHaveBeenCalledOnce();
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it("reserves once for Open Food Facts and returns a safe limited result", async () => {
    const allowedClient = slidingClient(() => 0);
    const allowedFetch = createExternalSearchFetch({ userId: "user-a", client: allowedClient, baseFetch: vi.fn(async () => Response.json({ status: "success", product: { code: "4006381333931", product_name: "Arroz" } })) });
    await expect(lookupOpenFoodFactsProduct("4006381333931", { fetchImpl: allowedFetch })).resolves.toMatchObject({ status: "found" });
    expect(allowedClient.rpc).toHaveBeenCalledOnce();

    const blockedFetch = createExternalSearchFetch({ userId: "user-a", client: { rpc: vi.fn(async () => ({ data: { allowed: false, retry_after_seconds: 20 }, error: null })) } });
    await expect(lookupOpenFoodFactsProduct("4006381333931", { fetchImpl: blockedFetch })).resolves.toEqual({ status: "rate-limited" });
  });

  it("does not reserve on a nutrition catalog hit", async () => {
    const guard = slidingClient(() => 0);
    const row = { normalized_name: "pechuga de pollo cruda", aliases: [], food_state: "raw", nutrition_basis: "per_100g", calories: 111, protein_g: 24, carbs_g: 0, fat_g: 1, source: "user", external_id: null, resolved_at: new Date().toISOString(), user_confirmed: true, food_catalog_item_id: null };
    const query: any = { eq: () => query, in: async () => ({ data: [row], error: null }), overlaps: async () => ({ data: [], error: null }) };
    const client = { from: () => ({ select: () => query }) };
    await expect(resolveInventoryNutritionForUser(client, "user-a", usdaInput, { usdaApiKey: "key", externalSearchClient: guard })).resolves.toMatchObject({ status: "resolved", meteringCacheHit: true });
    expect(guard.rpc).not.toHaveBeenCalled();
  });
});

describe("external search guard migration", () => {
  it("uses a private, locked, server-time sliding window available only to service_role", () => {
    for (const fragment of [
      "user_id uuid primary key references auth.users(id) on delete cascade", "request_timestamps timestamptz[]",
      "enable row level security", "force row level security", "statement_timestamp()", "for update",
      "from unnest(usage_row.request_timestamps)", "where requested_at > cutoff", "cardinality(recent_requests) >= p_limit",
      "grant execute on function public.reserve_external_search_request(uuid, integer, integer) to service_role",
    ]) expect(migration).toContain(fragment);
    expect(migration).toContain("revoke all on table public.external_search_request_usage from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.reserve_external_search_request(uuid, integer, integer) from public, anon, authenticated");
  });
});
