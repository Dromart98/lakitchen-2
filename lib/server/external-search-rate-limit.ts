import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/server/logger";

export const EXTERNAL_SEARCH_REQUEST_LIMIT_FALLBACK = 10;
export const EXTERNAL_SEARCH_WINDOW_SECONDS_FALLBACK = 60;
const RESERVATION_TIMEOUT_MS = 1_500;

type GuardClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

type Reservation = { allowed: boolean; retry_after_seconds: number };

export function getExternalSearchRequestLimit(value = process.env.EXTERNAL_SEARCH_REQUEST_LIMIT): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : EXTERNAL_SEARCH_REQUEST_LIMIT_FALLBACK;
}

export function getExternalSearchWindowSeconds(value = process.env.EXTERNAL_SEARCH_WINDOW_SECONDS): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : EXTERNAL_SEARCH_WINDOW_SECONDS_FALLBACK;
}

async function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("external-search-reservation-timeout")), RESERVATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function createExternalSearchFetch(input: {
  userId: string;
  baseFetch?: typeof fetch;
  client?: GuardClient;
  limit?: number;
  windowSeconds?: number;
}): typeof fetch {
  const logger = createLogger("nutrition", "external_search_guard");
  let reservation: Promise<Reservation | null> | null = null;

  const reserveOnce = () => {
    reservation ??= (async () => {
      try {
        const client = input.client ?? createAdminClient() as unknown as GuardClient;
        const result = await withTimeout(client.rpc("reserve_external_search_request", {
          p_user_id: input.userId,
          p_limit: input.limit ?? getExternalSearchRequestLimit(),
          p_window_seconds: input.windowSeconds ?? getExternalSearchWindowSeconds(),
        }));
        const data = result.data as Partial<Reservation> | null;
        if (result.error || !data || typeof data.allowed !== "boolean" || typeof data.retry_after_seconds !== "number") {
          throw new Error("external-search-reservation-failed");
        }
        return { allowed: data.allowed, retry_after_seconds: Math.max(0, Math.ceil(data.retry_after_seconds)) };
      } catch (error) {
        logger.warn("reservation_failed", { error });
        return null;
      }
    })();
    return reservation;
  };

  return async (request, init) => {
    const url = typeof request === "string" || request instanceof URL ? String(request) : request.url;
    const hostname = new URL(url).hostname;
    const isProtectedSearch = hostname === "api.nal.usda.gov" || hostname === "world.openfoodfacts.org";
    if (!isProtectedSearch) return (input.baseFetch ?? fetch)(request, init);

    const reserved = await reserveOnce();
    if (!reserved?.allowed) {
      const headers: Record<string, string> = {
        "x-lakitchen-external-search": reserved ? "rate-limited" : "unavailable",
      };
      if (reserved && reserved.retry_after_seconds > 0) headers["Retry-After"] = String(reserved.retry_after_seconds);
      return new Response(null, { status: 429, headers });
    }
    return (input.baseFetch ?? fetch)(request, init);
  };
}

export function externalSearchFailure(response: Response): "external-search-limit" | "external-search-unavailable" | null {
  const status = response.headers.get("x-lakitchen-external-search");
  return status === "rate-limited" ? "external-search-limit" : status === "unavailable" ? "external-search-unavailable" : null;
}
