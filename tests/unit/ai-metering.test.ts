import { describe, expect, it, vi } from "vitest";

import { AI_METERING_PERSIST_TIMEOUT_MS, AI_PRICING_VERSION, calculateAiCostUsdMicros, classifyAiResult, createAiUsageMeter, extractOpenAiUsage } from "@/lib/ai/metering";

const usageBody = (input: number, cached: number, output: number, reasoning: number) => ({
  status: "completed",
  usage: {
    input_tokens: input,
    input_tokens_details: { cached_tokens: cached },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: reasoning },
    total_tokens: input + output,
  },
});

function recordingClient(rows: Record<string, unknown>[]) {
  return { from: () => ({ insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; } }) } as never;
}

describe("private AI usage metering", () => {
  it("calculates Terra cost in integer USD micros without charging reasoning twice", () => {
    const usage = extractOpenAiUsage(usageBody(1_000, 100, 100, 40));
    expect(calculateAiCostUsdMicros("gpt-5.6-terra", usage)).toBe(3_775);
    expect(calculateAiCostUsdMicros("unpriced-model", usage)).toBeNull();
  });

  it("aggregates real provider usage across retry attempts", async () => {
    const rows: Record<string, unknown>[] = [];
    const responses = [usageBody(100, 20, 30, 10), usageBody(200, 0, 40, 15)];
    const meter = createAiUsageMeter({
      userId: "user-a", feature: "text_meal", model: "gpt-5.6-terra", client: recordingClient(rows), now: () => 150,
      quotaClient: { rpc: async () => ({ data: true, error: null }) },
      baseFetch: vi.fn(async () => Response.json(responses.shift())),
    });
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.fetchImpl("https://api.openai.com/v1/responses");
    await meter.finish({ outcome: "success" });
    expect(rows[0]).toMatchObject({
      user_id: "user-a", provider_request_count: 2, attempts: 2, input_tokens: 300,
      cached_input_tokens: 20, output_tokens: 70, reasoning_tokens: 25, total_tokens: 370,
      estimated_cost_usd_micros: 1_755, pricing_version: AI_PRICING_VERSION,
    });
  });

  it("records a cache hit with no provider request, tokens, or cost", async () => {
    const rows: Record<string, unknown>[] = [];
    const meter = createAiUsageMeter({ userId: "user-b", feature: "photo_meal", model: "gpt-5.6-terra", client: recordingClient(rows) });
    await meter.finish({ outcome: "success", cacheHit: true });
    expect(rows[0]).toMatchObject({ cache_hit: true, provider_request_count: 0, attempts: 0, total_tokens: 0, estimated_cost_usd_micros: 0 });
  });

  it("persists a successful insert without warning", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const rows: Record<string, unknown>[] = [];
      const meter = createAiUsageMeter({ userId: "user-ok", feature: "text_meal", model: "gpt-5.6-terra", client: recordingClient(rows) });
      await expect(meter.finish({ outcome: "success" })).resolves.toBeUndefined();
      expect(rows).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps metering persistence best-effort", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const meter = createAiUsageMeter({
      userId: "user-c", feature: "daily_plan", model: "gpt-5.6-terra",
      client: { from: () => ({ insert: async () => { throw new Error("database unavailable"); } }) } as never,
    });
    await expect(meter.finish({ outcome: "error", errorCode: "provider-timeout" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"usage_metering_write_failed"'));
    warn.mockRestore();
  });

  it("detects a resolved insert error without exposing it or rejecting finish", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const meter = createAiUsageMeter({
      userId: "user-d", feature: "inventory_nutrition", model: "gpt-5.6-terra",
      client: { from: () => ({ insert: async () => ({ error: { message: "private database detail" } }) }) } as never,
    });
    await expect(meter.finish({ outcome: "success" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"usage_metering_write_failed"'));
    expect(warn).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("private"));
    warn.mockRestore();
  });

  it("stops waiting for an insert that never resolves and clears its timeout", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const meter = createAiUsageMeter({
        userId: "user-timeout", feature: "photo_meal", model: "gpt-5.6-terra",
        client: { from: () => ({ insert: () => new Promise<never>(() => undefined) }) } as never,
      });
      const finish = meter.finish({ outcome: "success" });
      await vi.advanceTimersByTimeAsync(AI_METERING_PERSIST_TIMEOUT_MS);
      await expect(finish).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"usage_metering_write_failed"'));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("preserves safe nutrition resolution reasons", () => {
    expect(classifyAiResult({ status: "unresolved", reason: "not-configured" })).toEqual({ outcome: "error", errorCode: "not-configured" });
    expect(classifyAiResult({ status: "unresolved", reason: "provider-error" })).toEqual({ outcome: "error", errorCode: "provider-error" });
  });
});
