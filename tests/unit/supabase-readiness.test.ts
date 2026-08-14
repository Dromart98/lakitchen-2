import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("Supabase readiness check", () => {
  it("uses the official Auth health endpoint without querying application data", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    const { checkSupabaseReadiness } = await import("@/lib/supabase/readiness");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(checkSupabaseReadiness(fetchMock, 50)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/health",
      expect.objectContaining({
        method: "GET",
        headers: { apikey: "public-key" },
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestUrls).not.toEqual(expect.arrayContaining([expect.stringMatching(/rest\/v1|inventory_items/)]));
  });

  it("returns false for a non-successful response", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    const { checkSupabaseReadiness } = await import("@/lib/supabase/readiness");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(checkSupabaseReadiness(fetchMock, 50)).resolves.toBe(false);
  });

  it("fails closed on a network error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    const { checkSupabaseReadiness } = await import("@/lib/supabase/readiness");
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network error"));

    await expect(checkSupabaseReadiness(fetchMock, 50)).resolves.toBe(false);
  });

  it("fails closed when the dependency times out", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    const { checkSupabaseReadiness } = await import("@/lib/supabase/readiness");
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const result = checkSupabaseReadiness(fetchMock, 25);

    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toBe(false);
  });
});
