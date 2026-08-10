import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

export type StructuredLogRecord = {
  timestamp: string;
  level: LogLevel;
  event: string;
  component: string;
  action: string;
  correlation_id: string;
  release?: string;
  [key: string]: unknown;
};

const context = new AsyncLocalStorage<{ correlationId: string }>();
const blockedKeys = /(?:authorization|cookie|email|image|password|prompt|raw|response|secret|token|api[_-]?key|meal|dictat|content)/i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i;
const jwt = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const dataImage = /data:image\/[a-z0-9.+-]+;base64,/i;

function safeValue(key: string, value: unknown, depth = 0): unknown {
  if (blockedKeys.test(key)) return "[REDACTED]";
  if (depth > 4) return "[REDACTED]";
  if (/^(?:error|exception)$/i.test(key) && value && typeof value === "object") {
    const candidate = value as { name?: unknown; code?: unknown; status?: unknown };
    return {
      name: typeof candidate.name === "string" ? candidate.name : "Error",
      ...(typeof candidate.code === "string" || typeof candidate.code === "number" ? { code: candidate.code } : {}),
      ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
    };
  }
  if (typeof value === "string") {
    if (email.test(value) || bearer.test(value) || jwt.test(value) || dataImage.test(value)) return "[REDACTED]";
    return value.length > 256 ? `${value.slice(0, 64)}…[TRUNCATED]` : value;
  }
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue("item", item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as LogFields).map(([childKey, child]) => [childKey, safeValue(childKey, child, depth + 1)]));
  }
  return typeof value === "number" || typeof value === "boolean" || value === null ? value : String(value);
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function withCorrelation<T>(operation: () => T, correlationId = createCorrelationId()): T {
  return context.run({ correlationId }, operation);
}

export function getCorrelationId(): string {
  return context.getStore()?.correlationId ?? createCorrelationId();
}

export function hasCorrelation(): boolean {
  return context.getStore() !== undefined;
}

export function createStructuredLogRecord(input: {
  level: LogLevel;
  event: string;
  component: string;
  action: string;
  correlationId?: string;
  fields?: LogFields;
  now?: () => Date;
}): StructuredLogRecord {
  const fields = safeValue("fields", input.fields ?? {}) as LogFields;
  return {
    ...fields,
    timestamp: (input.now?.() ?? new Date()).toISOString(),
    level: input.level,
    event: input.event,
    component: input.component,
    action: input.action,
    correlation_id: input.correlationId ?? getCorrelationId(),
    ...(process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE
      ? { release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_RELEASE }
      : {}),
  };
}

export function log(input: Omit<Parameters<typeof createStructuredLogRecord>[0], "now">): void {
  const record = createStructuredLogRecord(input);
  const output = process.env.NODE_ENV === "production"
    ? JSON.stringify(record)
    : `[${record.level}] ${record.component}.${record.event} (${record.correlation_id}) ${JSON.stringify(record)}`;
  const writer = record.level === "error" ? console.error : record.level === "warn" ? console.warn : record.level === "debug" ? console.debug : console.info;
  writer(output);
}

export function createLogger(component: string, action: string) {
  const write = (level: LogLevel, event: string, fields?: LogFields) => log({ level, event, component, action, fields });
  return {
    debug: (event: string, fields?: LogFields) => write("debug", event, fields),
    info: (event: string, fields?: LogFields) => write("info", event, fields),
    warn: (event: string, fields?: LogFields) => write("warn", event, fields),
    error: (event: string, fields?: LogFields) => write("error", event, fields),
  };
}
