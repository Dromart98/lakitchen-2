import { describe, expect, it, vi } from "vitest";

import { AI_PRICING_VERSION, calculateAiCostUsdMicros, createAiUsageMeter, extractOpenAiUsage } from "@/lib/ai/metering";

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

  it("keeps metering persistence best-effort", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const meter = createAiUsageMeter({
      userId: "user-c", feature: "daily_plan", model: "gpt-5.6-terra",
      client: { from: () => ({ insert: async () => { throw new Error("database unavailable"); } }) } as never,
    });
    await expect(meter.finish({ outcome: "error", errorCode: "provider-timeout" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("ai_usage_metering_write_failed", "database unavailable");
    warn.mockRestore();
  });
});
