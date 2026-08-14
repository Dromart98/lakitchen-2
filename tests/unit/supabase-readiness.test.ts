import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("Supabase readiness check", () => {
  it("performs a read-only request without returning rows", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    const { checkSupabaseReadiness } = await import("@/lib/supabase/readiness");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(checkSupabaseReadiness(fetchMock, 50)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/inventory_items?select=id&limit=0",
      expect.objectContaining({ method: "HEAD", cache: "no-store", signal: expect.any(AbortSignal) }),
    );
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
