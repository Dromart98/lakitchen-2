import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captured: [] as unknown[],
  tags: new Map<string, string>(),
  context: undefined as unknown,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown) => sentry.captured.push(error),
  withScope: (operation: (scope: Record<string, (...args: unknown[]) => void>) => void) => operation({
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
    setTag: (key: unknown, value: unknown) => sentry.tags.set(String(key), String(value)),
    setContext: (_key: unknown, value: unknown) => { sentry.context = value; },
  }),
}));

import { reportUnexpectedError } from "@/lib/server/error-reporter";
import { withCorrelation } from "@/lib/server/logger";

afterEach(() => {
  vi.unstubAllEnvs();
  sentry.captured.length = 0;
  sentry.tags.clear();
  sentry.context = undefined;
  vi.restoreAllMocks();
});

describe("unexpected error reporter", () => {
  it("uses the logger correlation ID in the Sentry event", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.test/1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("private provider response");

    const returnedId = withCorrelation(() => reportUnexpectedError(error, {
      action: "generate",
      component: "recipes",
      route: "/recipes",
      runtime: "node",
    }), "correlation-123");

    expect(returnedId).toBe("correlation-123");
    expect(sentry.tags.get("correlation_id")).toBe("correlation-123");
    expect(sentry.context).toMatchObject({ correlation_id: "correlation-123", action: "generate", component: "recipes" });
    expect(sentry.captured).toEqual([error]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("correlation-123"));
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("private provider response"));
  });

  it("fails open without a DSN and can log without double-capturing framework errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(withCorrelation(() => reportUnexpectedError(new Error("down"), {
      action: "render",
      component: "next_request",
      capture: false,
    }), "correlation-456")).toBe("correlation-456");
    expect(sentry.captured).toHaveLength(0);
  });
});
