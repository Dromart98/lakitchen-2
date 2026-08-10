import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AI_DAILY_REQUEST_LIMIT_FALLBACK, createAiUsageMeter, getAiDailyRequestLimit } from "@/lib/ai/metering";

const migration = readFileSync("supabase/migrations/20260810170000_create_ai_daily_request_usage.sql", "utf8").toLowerCase();

function client(reserve: () => Promise<{ data: boolean | null; error: unknown }>) {
  return { rpc: vi.fn(reserve) };
}

describe("daily AI request guard", () => {
  it("uses a validated centralized setting with an explicit fallback", () => {
    expect(getAiDailyRequestLimit("7")).toBe(7);
    expect(getAiDailyRequestLimit("0")).toBe(AI_DAILY_REQUEST_LIMIT_FALLBACK);
    expect(getAiDailyRequestLimit("invalid")).toBe(20);
  });

  it("reserves once before the first provider attempt and reuses it for retries", async () => {
    const quotaClient = client(async () => ({ data: true, error: null }));
    const provider = vi.fn(async () => Response.json({}));
    const meter = createAiUsageMeter({ userId: "user-a", feature: "text_meal", model: "model", quotaClient, baseFetch: provider });
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    expect(quotaClient.rpc).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("does not reserve for deterministic calls or cache-only completion", async () => {
    const quotaClient = client(async () => ({ data: true, error: null }));
    const provider = vi.fn(async () => Response.json({}));
    const meter = createAiUsageMeter({ userId: "user-a", feature: "inventory_nutrition", model: "model", quotaClient, baseFetch: provider });
    await meter.fetchImpl("https://api.nal.usda.gov/fdc/v1/foods/search");
    await meter.finish({ outcome: "success", cacheHit: true });
    expect(quotaClient.rpc).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("fails closed before the provider when the limit is reached or storage fails", async () => {
    for (const quotaClient of [client(async () => ({ data: false, error: null })), client(async () => { throw new Error("down"); })]) {
      const provider = vi.fn();
      const meter = createAiUsageMeter({ userId: "user-a", feature: "photo_meal", model: "model", quotaClient, baseFetch: provider });
      expect((await meter.fetchImpl("https://api.openai.com/v1/responses")).status).toBe(429);
      expect(provider).not.toHaveBeenCalled();
    }
  });

  it("a disabled plan feature neither reserves nor calls the provider", async () => {
    const rows: Record<string, unknown>[] = [];
    const quotaClient = client(async () => ({ data: true, error: null }));
    const provider = vi.fn();
    const meter = createAiUsageMeter({
      userId: "user-a", feature: "recipe_generation", model: "model", quotaClient, baseFetch: provider,
      featurePolicy: () => false,
      client: { from: () => ({ insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; } }) },
    });
    expect(meter.authorizeFeature()).toBe(false);
    await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
    expect(meter.getAccessError()).toBe("ai-feature-disabled");
    expect(quotaClient.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ outcome: "error", error_code: "ai-feature-disabled", provider_request_count: 0, total_tokens: 0, estimated_cost_usd_micros: 0 });
  });

  it("authorizes an enabled feature without reserving until the provider is called", async () => {
    const quotaClient = client(async () => ({ data: true, error: null }));
    const provider = vi.fn(async () => Response.json({}));
    const meter = createAiUsageMeter({ userId: "user-a", feature: "text_meal", model: "model", quotaClient, baseFetch: provider });
    expect(meter.authorizeFeature()).toBe(true);
    expect(quotaClient.rpc).not.toHaveBeenCalled();
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    expect(quotaClient.rpc).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledOnce();
  });
});

describe("daily AI usage migration", () => {
  it("is private, cascade-owned, UTC server dated, and race-safe", () => {
    expect(migration).toContain("primary key (user_id, usage_date)");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.ai_daily_request_usage from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.reserve_ai_daily_request(uuid, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reserve_ai_daily_request(uuid, integer) to service_role");
    expect(migration).toContain("statement_timestamp() at time zone 'utc'");
    expect(migration).toContain("where usage.request_count < p_limit");
  });
});
