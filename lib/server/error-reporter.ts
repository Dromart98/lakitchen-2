import * as Sentry from "@sentry/nextjs";

import { createLogger, getCorrelationId } from "@/lib/server/logger";

type ReportContext = {
  action: string;
  component: string;
  route?: string;
  runtime?: "node" | "edge";
  capture?: boolean;
};

export function reportUnexpectedError(error: unknown, reportContext: ReportContext): string {
  const correlationId = getCorrelationId();
  createLogger(reportContext.component, reportContext.action).error("unexpected_error", {
    correlation_id: correlationId,
    error,
  });

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN || reportContext.capture === false) return correlationId;
  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("correlation_id", correlationId);
    scope.setTag("component", reportContext.component);
    scope.setTag("action", reportContext.action);
    if (reportContext.route) scope.setTag("route", reportContext.route);
    if (reportContext.runtime) scope.setTag("runtime", reportContext.runtime);
    const { capture: _, ...safeContext } = reportContext;
    scope.setContext("monitoring", { correlation_id: correlationId, ...safeContext });
    scope.setFingerprint(["{{ default }}", reportContext.component, reportContext.action]);
    Sentry.captureException(error);
  });
  return correlationId;
}
