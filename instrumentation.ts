import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, errorContext) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportUnexpectedError } = await import("@/lib/server/error-reporter");
    const correlationId = reportUnexpectedError(error, {
      action: errorContext.routeType || errorContext.routerKind,
      component: "next_request",
      route: errorContext.routePath || request.path,
      runtime: "node",
      capture: false,
    });
    Sentry.withScope((scope) => {
      scope.setTag("correlation_id", correlationId);
      scope.setTag("component", "next_request");
      scope.setTag("action", errorContext.routeType || errorContext.routerKind);
      scope.setTag("route", errorContext.routePath || request.path);
      scope.setTag("runtime", "node");
      scope.setContext("monitoring", { correlation_id: correlationId, route: errorContext.routePath || request.path });
      Sentry.captureRequestError(error, request, errorContext);
    });
    return;
  }
  Sentry.captureRequestError(error, request, errorContext);
};
