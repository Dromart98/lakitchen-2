import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const PRIVATE_KEY = /(?:authorization|body|bytes|content|cookie|description|dictat|email|file|formdata|image|input|meal|password|payload|prompt|query|raw|request|response|secret|text|token|url|user|api[_-]?key)/i;
const PRIVATE_VALUE = /(?:\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|data:image\/[^;]+;base64,)/i;
const ALLOWED_TAGS = new Set(["action", "component", "correlation_id", "route", "runtime"]);

export function getSentryRelease(): string | undefined {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE;
}

export function getSentryEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development";
}

function safeString(value: string): string {
  if (PRIVATE_VALUE.test(value) || value.length > 256) return "[REDACTED]";
  return value;
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (PRIVATE_KEY.test(key) || depth > 4) return "[REDACTED]";
  if (typeof value === "string") return safeString(value);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, "item", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeValue(child, childKey, depth + 1)]));
  }
  return typeof value === "number" || typeof value === "boolean" || value === null ? value : undefined;
}

export function sanitizeSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  const exception = event.exception?.values?.map((value) => ({
    ...value,
    value: value.type ? `${value.type} (details redacted)` : "Error (details redacted)",
    stacktrace: value.stacktrace ? {
      ...value.stacktrace,
      frames: value.stacktrace.frames?.map((frame) => ({
        filename: frame.filename ? safeString(frame.filename.split("?")[0]) : frame.filename,
        function: frame.function ? safeString(frame.function) : frame.function,
        module: frame.module ? safeString(frame.module) : frame.module,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app,
      })),
    } : undefined,
  }));
  const tags = Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key]) => ALLOWED_TAGS.has(key)).map(([key, value]) => [key, safeString(String(value))]));

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    logger: event.logger,
    release: event.release,
    environment: event.environment,
    transaction: event.transaction ? safeString(event.transaction.split("?")[0]) : undefined,
    exception: exception ? { values: exception } : undefined,
    fingerprint: event.fingerprint?.map(safeString),
    tags,
    contexts: event.contexts ? { monitoring: sanitizeValue(event.contexts.monitoring, "monitoring") as Record<string, unknown> } : undefined,
  };
}

export const sentryBaseOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: 0,
  release: getSentryRelease(),
  environment: getSentryEnvironment(),
  beforeSend: sanitizeSentryEvent,
};
