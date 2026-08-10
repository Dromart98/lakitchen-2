
import { createAdminClient } from "@/lib/supabase/admin";
import { isAiFeatureEnabled, type AiPlan } from "@/lib/ai/access-policy";
import { createLogger } from "@/lib/server/logger";

export const AI_PRICING_VERSION = "2026-08-10";
// Metering is best-effort and must add only a short, bounded wait after the AI result is ready.
export const AI_METERING_PERSIST_TIMEOUT_MS = 1_500;
// Quota storage is a blocking guard, so keep its wait short and fail closed.
export const AI_QUOTA_RESERVATION_TIMEOUT_MS = 1_500;
export const AI_DAILY_REQUEST_LIMIT_FALLBACK = 20;

type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type Pricing = { inputUsdMicrosPerMillion: number; cachedInputUsdMicrosPerMillion: number; outputUsdMicrosPerMillion: number };

const MODEL_PRICING: Readonly<Record<string, Pricing>> = {
  "gpt-5.6-terra": {
    inputUsdMicrosPerMillion: 2_500_000,
    cachedInputUsdMicrosPerMillion: 250_000,
    outputUsdMicrosPerMillion: 15_000_000,
  },
};

const emptyUsage = (): TokenUsage => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 });

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function extractOpenAiUsage(body: unknown): TokenUsage {
  if (typeof body !== "object" || body === null) return emptyUsage();
  const usage = (body as Record<string, unknown>).usage;
  if (typeof usage !== "object" || usage === null) return emptyUsage();
  const values = usage as Record<string, unknown>;
  const inputDetails = typeof values.input_tokens_details === "object" && values.input_tokens_details !== null
    ? values.input_tokens_details as Record<string, unknown> : {};
  const outputDetails = typeof values.output_tokens_details === "object" && values.output_tokens_details !== null
    ? values.output_tokens_details as Record<string, unknown> : {};
  return {
    inputTokens: nonNegativeInteger(values.input_tokens),
    cachedInputTokens: nonNegativeInteger(inputDetails.cached_tokens),
    outputTokens: nonNegativeInteger(values.output_tokens),
    reasoningTokens: nonNegativeInteger(outputDetails.reasoning_tokens),
    totalTokens: nonNegativeInteger(values.total_tokens),
  };
}

export function calculateAiCostUsdMicros(model: string, usage: TokenUsage): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  // Integer rates are per million tokens, so division by 1M yields integer USD micros.
  // Reasoning tokens are already included in outputTokens and are not charged twice.
  return Math.round((
    uncachedInput * pricing.inputUsdMicrosPerMillion
    + usage.cachedInputTokens * pricing.cachedInputUsdMicrosPerMillion
    + usage.outputTokens * pricing.outputUsdMicrosPerMillion
  ) / 1_000_000);
}

export type AiUsageOutcome = "success" | "clarification" | "error";
export type AiUsageFeature = "text_meal" | "photo_meal" | "inventory_nutrition" | "voice_inventory" | "voice_shopping" | "recipe_generation" | "daily_plan";

type MeteringClient = { from(table: "ai_usage_events"): { insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }> } };
type QuotaClient = { rpc(name: "reserve_ai_daily_request", args: { p_user_id: string; p_limit: number }): PromiseLike<{ data: boolean | null; error: unknown }> };
export type AiAccessErrorCode = "daily-ai-limit" | "ai-access-unavailable" | "ai-feature-disabled";

export function getAiDailyRequestLimit(value = process.env.AI_DAILY_REQUEST_LIMIT): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : AI_DAILY_REQUEST_LIMIT_FALLBACK;
}

async function waitForMeteringInsert(operation: PromiseLike<{ error: unknown }>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("metering-insert-timeout")), AI_METERING_PERSIST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function waitForQuotaReservation(operation: PromiseLike<{ data: boolean | null; error: unknown }>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("quota-reservation-timeout")), AI_QUOTA_RESERVATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function createAiUsageMeter(input: { userId: string; feature: AiUsageFeature; model: string; client?: MeteringClient | null; quotaClient?: QuotaClient | null; plan?: AiPlan; featurePolicy?: typeof isAiFeatureEnabled; dailyLimit?: number; now?: () => number; baseFetch?: typeof fetch }) {
  const startedAt = (input.now ?? Date.now)();
  const logger = createLogger("ai", `metering.${input.feature}`);
  const aggregate = emptyUsage();
  let providerRequestCount = 0;
  let accessError: AiAccessErrorCode | null = null;
  let reservation: Promise<boolean> | null = null;

  function authorizeFeature(): boolean {
    if (!(input.featurePolicy ?? isAiFeatureEnabled)(input.plan ?? "default", input.feature)) {
      accessError = "ai-feature-disabled";
      return false;
    }
    return true;
  }

  async function reserveOnce(): Promise<boolean> {
    if (!authorizeFeature()) return false;
    if (!reservation) reservation = (async () => {
      try {
        const client = input.quotaClient ?? createAdminClient() as unknown as QuotaClient;
        const { data, error } = await waitForQuotaReservation(client.rpc("reserve_ai_daily_request", {
          p_user_id: input.userId,
          p_limit: input.dailyLimit ?? getAiDailyRequestLimit(),
        }));
        if (error) throw new Error("quota-reservation-failed");
        if (data !== true) accessError = "daily-ai-limit";
        return data === true;
      } catch (error) {
        accessError = "ai-access-unavailable";
        logger.warn("quota_reservation_failed", { error });
        return false;
      }
    })();
    return reservation;
  }

  const fetchImpl: typeof fetch = async (request, init) => {
    const url = typeof request === "string" || request instanceof URL ? String(request) : request.url;
    const isOpenAiRequest = new URL(url).hostname === "api.openai.com";
    if (isOpenAiRequest && !await reserveOnce()) {
      return new Response(null, { status: 429, headers: { "x-lakitchen-ai-access": accessError ?? "ai-access-unavailable" } });
    }
    if (isOpenAiRequest) providerRequestCount += 1;
    const response = await (input.baseFetch ?? fetch)(request, init);
    if (isOpenAiRequest) {
      try {
        const usage = extractOpenAiUsage(await response.clone().json());
        aggregate.inputTokens += usage.inputTokens;
        aggregate.cachedInputTokens += usage.cachedInputTokens;
        aggregate.outputTokens += usage.outputTokens;
        aggregate.reasoningTokens += usage.reasoningTokens;
        aggregate.totalTokens += usage.totalTokens;
      } catch { /* A response without readable usage still counts as an attempt. */ }
    }
    return response;
  };

  async function finish(result: { outcome: AiUsageOutcome; errorCode?: string | null; cacheHit?: boolean }) {
    const cacheHit = result.cacheHit === true;
    const usage = cacheHit ? emptyUsage() : aggregate;
    const attempts = cacheHit ? 0 : providerRequestCount;
    let client = input.client;
    try {
      client ??= createAdminClient() as unknown as MeteringClient;
      const { error } = await waitForMeteringInsert(client.from("ai_usage_events").insert({
        user_id: input.userId,
        feature: input.feature,
        provider: "openai",
        model: input.model,
        cache_hit: cacheHit,
        provider_request_count: attempts,
        attempts,
        duration_ms: Math.max(0, (input.now ?? Date.now)() - startedAt),
        outcome: accessError ? "error" : result.outcome,
        error_code: accessError ?? (result.outcome === "error" ? result.errorCode ?? "unknown" : null),
        input_tokens: usage.inputTokens,
        cached_input_tokens: usage.cachedInputTokens,
        output_tokens: usage.outputTokens,
        reasoning_tokens: usage.reasoningTokens,
        total_tokens: usage.totalTokens,
        estimated_cost_usd_micros: cacheHit || accessError ? 0 : calculateAiCostUsdMicros(input.model, usage),
        pricing_version: AI_PRICING_VERSION,
      }));
      if (error) throw new Error("metering-insert-failed");
    } catch (error) {
      logger.warn("usage_metering_write_failed", { error });
    }
  }

  return { authorizeFeature, fetchImpl, finish, getAccessError: () => accessError };
}

export function classifyAiResult(result: { status: string; code?: string; reason?: "not-found" | "not-configured" | "provider-error" }): { outcome: AiUsageOutcome; errorCode?: string } {
  if (result.status === "success" || result.status === "resolved" || result.status === "selected") return { outcome: "success" };
  if (result.status === "needs-clarification") return { outcome: "clarification" };
  return { outcome: "error", errorCode: result.code ?? result.reason ?? "provider-error" };
}
