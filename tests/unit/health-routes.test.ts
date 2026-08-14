import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getLiveness } from "@/app/api/health/live/route";
import { GET as getReadiness } from "@/app/api/health/ready/route";
import { checkSupabaseReadiness } from "@/lib/supabase/readiness";

vi.mock("@/lib/supabase/readiness", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/readiness")>();
  return { ...original, checkSupabaseReadiness: vi.fn() };
});

const readinessMock = vi.mocked(checkSupabaseReadiness);

afterEach(() => {
  vi.clearAllMocks();
});

describe("health routes", () => {
  it("returns a deterministic liveness response without checking dependencies", async () => {
    const response = getLiveness();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(readinessMock).not.toHaveBeenCalled();
  });

  it("returns 200 when Supabase is available", async () => {
    readinessMock.mockResolvedValue(true);

    const response = await getReadiness();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns 503 when Supabase is unavailable", async () => {
    readinessMock.mockResolvedValue(false);

    const response = await getReadiness();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
