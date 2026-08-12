import { afterEach, describe, expect, it, vi } from "vitest";

import { getSentryEnvironment, getSentryRelease, sanitizeSentryEvent } from "@/lib/monitoring/sentry";

afterEach(() => vi.unstubAllEnvs());

describe("Sentry monitoring privacy contract", () => {
  it("removes request data, user data, secrets, PII, provider messages and source context", () => {
    const event = sanitizeSentryEvent({
      type: undefined,
      message: "private meal prompt",
      user: { email: "person@example.com", id: "private-id" },
      request: { cookies: { session: "secret" }, data: "private meal" },
      extra: { apiKey: "secret", response_raw: "provider private" },
      breadcrumbs: [{ message: "dictated private dinner" }],
      tags: { correlation_id: "correlation-safe", private_user_id: "private-id" },
      contexts: { monitoring: { correlation_id: "correlation-safe", prompt: "private dinner" }, device: { name: "private" } },
      exception: { values: [{ type: "ProviderError", value: "person@example.com raw provider response", stacktrace: { frames: [{ filename: "/app/action.ts?token=secret", function: "run", context_line: "private meal" }] } }] },
    });
    const serialized = JSON.stringify(event);
    for (const privateValue of ["person@example.com", "private-id", "private meal", "private dinner", "provider private", "token=secret", "dictated"]) expect(serialized).not.toContain(privateValue);
    expect(event).toMatchObject({ tags: { correlation_id: "correlation-safe" }, exception: { values: [{ type: "ProviderError", value: "ProviderError (details redacted)" }] } });
    expect(event?.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: "/app/action.ts", function: "run" });
  });

  it("uses Vercel deployment metadata with safe fallbacks", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "deployment-sha");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getSentryRelease()).toBe("deployment-sha");
    expect(getSentryEnvironment()).toBe("preview");
  });
});
