import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  AI_BURST_REQUEST_LIMIT_FALLBACK,
  AI_BURST_WINDOW_SECONDS_FALLBACK,
  createAiUsageMeter,
  getAiBurstRequestLimit,
  getAiBurstWindowSeconds,
} from "@/lib/ai/metering";

const migration = readFileSync("supabase/migrations/20260813000000_create_ai_burst_request_usage.sql", "utf8").toLowerCase();

function guardClient(burst: { allowed: boolean; retry_after_seconds: number }) {
  return {
    rpc: vi.fn(async (name: string) =>
      name === "reserve_ai_burst_request"
        ? { data: burst, error: null }
        : { data: true, error: null },
    ),
  };
}

function slidingGuardClient(now: () => number) {
  const requests = new Map<string, number[]>();
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== "reserve_ai_burst_request") return { data: true, error: null };

    const userId = String(args.p_user_id);
    const limit = Number(args.p_limit);
    const windowMs = Number(args.p_window_seconds) * 1_000;
    const current = now();
    const recent = (requests.get(userId) ?? []).filter((timestamp) => timestamp > current - windowMs);

    if (recent.length >= limit) {
      return {
        data: {
          allowed: false,
          retry_after_seconds: Math.max(1, Math.ceil((recent[0] + windowMs - current) / 1_000)),
        },
        error: null,
      };
    }

    requests.set(userId, [...recent, current]);
    return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
  });

  return { rpc, requests };
}

async function runAiAction(userId: string, client: { rpc: ReturnType<typeof vi.fn> }, provider: ReturnType<typeof vi.fn>) {
  const meter = createAiUsageMeter({
    userId,
    feature: "text_meal",
    model: "model",
    quotaClient: client as never,
    baseFetch: provider,
  });
  return meter.fetchImpl("https://api.openai.com/v1/responses");
}

describe("AI burst guard", () => {
  it("validates independent server-side settings", () => {
    expect(getAiBurstRequestLimit("8")).toBe(8);
    expect(getAiBurstRequestLimit("0")).toBe(AI_BURST_REQUEST_LIMIT_FALLBACK);
    expect(getAiBurstWindowSeconds("90")).toBe(90);
    expect(getAiBurstWindowSeconds("invalid")).toBe(AI_BURST_WINDOW_SECONDS_FALLBACK);
  });

  it("allows five actions in 60 seconds and blocks the sixth before daily quota", async () => {
    let now = 0;
    const client = slidingGuardClient(() => now);
    const provider = vi.fn(async () => Response.json({}));

    for (let index = 0; index < 5; index += 1) {
      expect((await runAiAction("user-a", client, provider)).status).toBe(200);
    }

    const blocked = await runAiAction("user-a", client, provider);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("x-lakitchen-ai-access")).toBe("ai-burst-limit");
    expect(provider).toHaveBeenCalledTimes(5);
    expect(client.rpc.mock.calls.filter(([name]) => name === "reserve_ai_burst_request")).toHaveLength(6);
    expect(client.rpc.mock.calls.filter(([name]) => name === "reserve_ai_daily_request")).toHaveLength(5);
    now += 1;
  });

  it("recovers when the oldest request leaves the sliding window", async () => {
    let now = 0;
    const client = slidingGuardClient(() => now);
    const provider = vi.fn(async () => Response.json({}));

    for (let index = 0; index < 5; index += 1) await runAiAction("user-a", client, provider);
    expect((await runAiAction("user-a", client, provider)).status).toBe(429);

    now = 60_001;
    expect((await runAiAction("user-a", client, provider)).status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(6);
  });

  it("does not allow a boundary burst when the old fixed window would reset", async () => {
    let now = 0;
    const client = slidingGuardClient(() => now);
    const provider = vi.fn(async () => Response.json({}));

    expect((await runAiAction("user-a", client, provider)).status).toBe(200);
    now = 59_000;
    for (let index = 0; index < 4; index += 1) {
      expect((await runAiAction("user-a", client, provider)).status).toBe(200);
    }

    now = 60_001;
    expect((await runAiAction("user-a", client, provider)).status).toBe(200);
    expect((await runAiAction("user-a", client, provider)).status).toBe(429);
    expect(provider).toHaveBeenCalledTimes(6);
  });

  it("isolates burst state between users", async () => {
    const client = slidingGuardClient(() => 0);
    const provider = vi.fn(async () => Response.json({}));

    for (let index = 0; index < 5; index += 1) await runAiAction("user-a", client, provider);
    expect((await runAiAction("user-a", client, provider)).status).toBe(429);
    expect((await runAiAction("user-b", client, provider)).status).toBe(200);
    expect(client.requests.get("user-a")).toHaveLength(5);
    expect(client.requests.get("user-b")).toHaveLength(1);
  });

  it("does not allow concurrent actions to exceed the threshold", async () => {
    const client = slidingGuardClient(() => 0);
    const provider = vi.fn(async () => Response.json({}));

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => runAiAction("user-a", client, provider)),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(5);
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
  it("keeps one private cascade-owned row per user and a locked sliding-window reservation", () => {
    expect(migration).toContain("user_id uuid primary key references auth.users(id) on delete cascade");
    expect(migration).toContain("request_timestamps timestamptz[]");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.ai_burst_request_usage from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.reserve_ai_burst_request(uuid, integer, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reserve_ai_burst_request(uuid, integer, integer) to service_role");
    expect(migration).toContain("server_now timestamptz := statement_timestamp()");
    expect(migration).toContain("for update");
    expect(migration).toContain("from unnest(usage_row.request_timestamps)");
    expect(migration).toContain("where requested_at > cutoff");
    expect(migration).toContain("cardinality(recent_requests) >= p_limit");
    expect(migration).toContain("recent_requests := array_append(recent_requests, server_now)");
    expect(migration).toContain("retry_after_seconds");
    expect(migration).not.toContain("window_started_at");
  });
});
