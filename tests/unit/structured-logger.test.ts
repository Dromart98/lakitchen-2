import { afterEach, describe, expect, it, vi } from "vitest";

import { createCorrelationId, createStructuredLogRecord, getCorrelationId, log, withCorrelation, withCorrelationIfMissing } from "@/lib/server/logger";

afterEach(() => vi.unstubAllEnvs());

describe("structured server logger", () => {
  it.each(["debug", "info", "warn", "error"] as const)("creates a minimum %s event", (level) => {
    const record = createStructuredLogRecord({ level, event: "failed", component: "inventory", action: "transfer", correlationId: "request-1", now: () => new Date("2026-08-10T12:00:00.000Z") });
    expect(record).toMatchObject({ timestamp: "2026-08-10T12:00:00.000Z", level, event: "failed", component: "inventory", action: "transfer", correlation_id: "request-1" });
  });

  it("keeps one correlation ID through an asynchronous operation", async () => {
    await withCorrelation(async () => {
      const first = getCorrelationId();
      await Promise.resolve();
      expect(getCorrelationId()).toBe(first);
    });
  });

  it("does not replace an existing correlation context", () => {
    withCorrelation(() => {
      const outer = getCorrelationId();
      withCorrelationIfMissing(() => expect(getCorrelationId()).toBe(outer));
    }, "existing-request");
  });

  it("generates non-sequential distinct operation IDs", () => {
    expect(createCorrelationId()).not.toBe(createCorrelationId());
  });

  it("writes a JSON object in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    log({ level: "warn", event: "dependency_failed", component: "recipes", action: "generate", correlationId: "request-prod" });
    const output = warn.mock.calls[0][0] as string;
    expect(JSON.parse(output)).toMatchObject({ level: "warn", event: "dependency_failed", correlation_id: "request-prod" });
    warn.mockRestore();
  });

  it("centrally sanitizes secrets, private content, errors and images", () => {
    const record = createStructuredLogRecord({
      level: "error", event: "provider_failed", component: "ai", action: "estimate", correlationId: "request-2",
      fields: { email: "person@example.com", cookie: "session=secret", apiKey: "key", prompt: "private dinner", response_raw: { food: "private" }, image: "data:image/jpeg;base64,abc", authorization: "Bearer abc", nested: { note: "person@example.com" }, error: { message: "raw provider payload", response: "private response", code: "P0001" } },
    });
    const serialized = JSON.stringify(record);
    for (const privateValue of ["person@example.com", "session=secret", "private dinner", "private", "data:image", "Bearer abc", "raw provider payload", "key"]) expect(serialized).not.toContain(privateValue);
    expect(record).toMatchObject({ email: "[REDACTED]", cookie: "[REDACTED]", prompt: "[REDACTED]", image: "[REDACTED]" });
  });

  it("redacts common private payload names, binaries, URLs and string errors", () => {
    const privateValue = "private-marker";
    const record = createStructuredLogRecord({
      level: "error", event: "failed", component: "ai", action: "call", correlationId: "request-3",
      fields: {
        input: privateValue, text: privateValue, description: privateValue, body: privateValue,
        payload: privateValue, request: privateValue, file: privateValue, bytes: privateValue,
        formData: privateValue, query: privateValue, url: `https://example.test/?q=${privateValue}`,
        endpoint: `https://example.test/search?q=${privateValue}`,
        attachment: new Uint8Array([112, 114, 105, 118, 97, 116, 101]),
        buffer: new ArrayBuffer(8), error: privateValue,
      },
    });
    expect(JSON.stringify(record)).not.toContain(privateValue);
    for (const key of ["input", "text", "description", "body", "payload", "request", "file", "bytes", "formData", "query", "url", "endpoint", "attachment", "buffer", "error"]) {
      expect(record[key]).toBe("[REDACTED]");
    }
  });
});
