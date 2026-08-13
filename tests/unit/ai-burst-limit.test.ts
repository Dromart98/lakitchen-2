import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AI_BURST_REQUEST_LIMIT_FALLBACK, AI_BURST_WINDOW_SECONDS_FALLBACK, createAiUsageMeter, getAiBurstRequestLimit, getAiBurstWindowSeconds } from "@/lib/ai/metering";

const migration = readFileSync("supabase/migrations/20260813000000_create_ai_burst_request_usage.sql", "utf8").toLowerCase();

function guardClient(burst: { allowed: boolean; retry_after_seconds: number }) {
  return { rpc: vi.fn(async (name: string) => name === "reserve_ai_burst_request"
    ? { data: burst, error: null }
    : { data: true, error: null }) };
}

describe("AI burst guard", () => {
  it("validates independent server-side settings", () => {
    expect(getAiBurstRequestLimit("8")).toBe(8);
    expect(getAiBurstRequestLimit("0")).toBe(AI_BURST_REQUEST_LIMIT_FALLBACK);
    expect(getAiBurstWindowSeconds("90")).toBe(90);
    expect(getAiBurstWindowSeconds("invalid")).toBe(AI_BURST_WINDOW_SECONDS_FALLBACK);
  });

  it("checks burst before daily quota and blocks provider with Retry-After", async () => {
    const client = guardClient({ allowed: false, retry_after_seconds: 27 });
    const provider = vi.fn();
    const meter = createAiUsageMeter({ userId: "user-a", feature: "text_meal", model: "model", quotaClient: client as never, baseFetch: provider });
    const response = await meter.fetchImpl("https://api.openai.com/v1/responses");
    expect(response.status).toBe(429);
    expect(response.headers.get("x-lakitchen-ai-access")).toBe("ai-burst-limit");
    expect(response.headers.get("Retry-After")).toBe("27");
    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith("reserve_ai_burst_request", expect.objectContaining({ p_limit: 5, p_window_seconds: 60 }));
    expect(provider).not.toHaveBeenCalled();
  });

  it("reserves burst and daily only once across provider retries", async () => {
    const client = guardClient({ allowed: true, retry_after_seconds: 0 });
    const provider = vi.fn(async () => Response.json({}));
    const meter = createAiUsageMeter({ userId: "user-a", feature: "photo_meal", model: "model", quotaClient: client as never, baseFetch: provider });
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("fails closed when burst storage fails", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: "private" } })) };
    const provider = vi.fn();
    const meter = createAiUsageMeter({ userId: "user-a", feature: "daily_plan", model: "model", quotaClient: client as never, baseFetch: provider });
    expect((await meter.fetchImpl("https://api.openai.com/v1/responses")).status).toBe(429);
    expect(meter.getAccessError()).toBe("ai-access-unavailable");
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("AI burst guard migration", () => {
  it("keeps one private cascade-owned row per user and an atomic server-time reservation", () => {
    expect(migration).toContain("user_id uuid primary key references auth.users(id) on delete cascade");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.ai_burst_request_usage from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.reserve_ai_burst_request(uuid, integer, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reserve_ai_burst_request(uuid, integer, integer) to service_role");
    expect(migration).toContain("server_now timestamptz := statement_timestamp()");
    expect(migration).toContain("on conflict (user_id) do update");
    expect(migration).toContain("usage.request_count < p_limit");
    expect(migration).toContain("retry_after_seconds");
  });
});
