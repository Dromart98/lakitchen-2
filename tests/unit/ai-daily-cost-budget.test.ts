import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AI_COST_GUARD_TIMEOUT_MS, createAiUsageMeter, getAiDailyCostBudgetUsdMicros, getAiProvisionalCostReservation } from "@/lib/ai/metering";

const sql = readFileSync("supabase/migrations/20260810180000_create_ai_daily_cost_budget.sql", "utf8").toLowerCase();
const usage = (input: number, output: number) => ({ usage: { input_tokens: input, output_tokens: output, total_tokens: input + output } });

function clients(costRpc: (name: string, args: Record<string, unknown>) => Promise<{ data: string | boolean | null; error: unknown }>) {
  return {
    quotaClient: { rpc: vi.fn(async () => ({ data: true, error: null })) },
    costGuardClient: { rpc: vi.fn(costRpc) },
  };
}

describe("daily AI cost guard", () => {
  it("enables only for a positive safe integer and derives the provisional reservation centrally", () => {
    expect(getAiDailyCostBudgetUsdMicros(undefined)).toBeNull();
    expect(getAiDailyCostBudgetUsdMicros("")).toBeNull();
    expect(getAiDailyCostBudgetUsdMicros("0")).toBeNull();
    expect(getAiDailyCostBudgetUsdMicros("1.5")).toBeNull();
    expect(getAiDailyCostBudgetUsdMicros("1000")).toBe(1000);
    expect(getAiProvisionalCostReservation(101, 20)).toBe(6);
  });

  it("reserves after request quota and before provider, then settles aggregate retry cost once", async () => {
    const order: string[] = [];
    const { quotaClient, costGuardClient } = clients(async (name) => {
      order.push(name);
      return name === "reserve_ai_daily_cost" ? { data: "reserved", error: null } : { data: true, error: null };
    });
    quotaClient.rpc.mockImplementation(async () => { order.push("quota"); return { data: true, error: null }; });
    const provider = vi.fn(async () => { order.push("provider"); return Response.json(usage(100, 20)); });
    const meter = createAiUsageMeter({ userId: "user-a", feature: "text_meal", model: "gpt-5.6-terra", dailyCostBudgetUsdMicros: 10_000, reservationId: "11111111-1111-4111-8111-111111111111", quotaClient, costGuardClient: costGuardClient as never, baseFetch: provider });
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.finish({ outcome: "success" });
    expect(order).toEqual(["quota", "reserve_ai_daily_cost", "provider", "provider", "settle_ai_daily_cost"]);
    expect(costGuardClient.rpc).toHaveBeenLastCalledWith("settle_ai_daily_cost", expect.objectContaining({ p_actual_cost_usd_micros: 1_100 }));
  });

  it("blocks exhausted budgets and unpriced models before the provider", async () => {
    const exhausted = clients(async () => ({ data: "limit", error: null }));
    const provider = vi.fn();
    const meter = createAiUsageMeter({ userId: "user-a", feature: "photo_meal", model: "gpt-5.6-terra", dailyCostBudgetUsdMicros: 100, ...exhausted, costGuardClient: exhausted.costGuardClient as never, baseFetch: provider });
    expect((await meter.fetchImpl("https://api.openai.com/v1/responses")).status).toBe(429);
    expect(meter.getAccessError()).toBe("daily-ai-cost-limit");

    const unpriced = clients(async () => ({ data: "reserved", error: null }));
    const meter2 = createAiUsageMeter({ userId: "user-a", feature: "photo_meal", model: "unknown", dailyCostBudgetUsdMicros: 100, ...unpriced, costGuardClient: unpriced.costGuardClient as never, baseFetch: provider });
    expect((await meter2.fetchImpl("https://api.openai.com/v1/responses")).status).toBe(429);
    expect(meter2.getAccessError()).toBe("ai-access-unavailable");
    expect(unpriced.costGuardClient.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not attempt cost storage when request quota is exhausted", async () => {
    const guarded = clients(async () => ({ data: "reserved", error: null }));
    guarded.quotaClient.rpc.mockResolvedValue({ data: false, error: null });
    const meter = createAiUsageMeter({ userId: "user-a", feature: "daily_plan", model: "gpt-5.6-terra", dailyCostBudgetUsdMicros: 100, ...guarded, costGuardClient: guarded.costGuardClient as never, baseFetch: vi.fn() });
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    expect(guarded.costGuardClient.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on cost storage timeout", async () => {
    vi.useFakeTimers();
    try {
      const guarded = clients(() => new Promise(() => undefined));
      const provider = vi.fn();
      const meter = createAiUsageMeter({ userId: "user-a", feature: "daily_plan", model: "gpt-5.6-terra", dailyCostBudgetUsdMicros: 100, ...guarded, costGuardClient: guarded.costGuardClient as never, baseFetch: provider });
      const result = meter.fetchImpl("https://api.openai.com/v1/responses");
      await vi.advanceTimersByTimeAsync(AI_COST_GUARD_TIMEOUT_MS);
      expect((await result).status).toBe(429);
      expect(meter.getAccessError()).toBe("ai-access-unavailable");
      expect(provider).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("keeps operational settlement independent from best-effort historical metering", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const guarded = clients(async (name) => name === "reserve_ai_daily_cost" ? { data: "reserved", error: null } : { data: true, error: null });
    const meter = createAiUsageMeter({
      userId: "user-a", feature: "recipe_generation", model: "gpt-5.6-terra", dailyCostBudgetUsdMicros: 1_000,
      ...guarded, costGuardClient: guarded.costGuardClient as never,
      client: { from: () => ({ insert: async () => ({ error: { message: "historical storage down" } }) }) } as never,
      baseFetch: async () => Response.json(usage(10, 10)),
    });
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.finish({ outcome: "success" });
    expect(guarded.costGuardClient.rpc).toHaveBeenCalledWith("settle_ai_daily_cost", expect.anything());
    expect(warn).toHaveBeenCalledWith("ai_usage_metering_write_failed");
    warn.mockRestore();
  });
});

describe("daily AI cost migration", () => {
  it("keeps private cascade-owned UTC state and atomic expiring reservations", () => {
    expect(sql.match(/references auth\.users\(id\) on delete cascade/g)).toHaveLength(2);
    expect(sql.match(/enable row level security/g)).toHaveLength(2);
    expect(sql.match(/force row level security/g)).toHaveLength(2);
    expect(sql).toContain("revoke all on table public.ai_daily_cost_usage, public.ai_daily_cost_reservations from public, anon, authenticated");
    expect(sql).toContain("statement_timestamp() at time zone 'utc'");
    expect(sql).toContain("for update");
    expect(sql).toContain("expires_at <= statement_timestamp()");
    expect(sql).toContain("spent + active_reserved + p_reserved_usd_micros > p_budget_usd_micros");
  });

  it("settles by reservation id idempotently and grants RPCs only to service role", () => {
    expect(sql).toContain("if reservation.status = 'settled' then return reservation.actual_cost_usd_micros = p_actual_cost_usd_micros");
    expect(sql).toContain("grant execute on function public.reserve_ai_daily_cost(uuid, uuid, bigint, bigint) to service_role");
    expect(sql).toContain("grant execute on function public.settle_ai_daily_cost(uuid, uuid, bigint) to service_role");
    expect(sql).toContain("revoke all on function public.settle_ai_daily_cost(uuid, uuid, bigint) from public, anon, authenticated");
  });
});
