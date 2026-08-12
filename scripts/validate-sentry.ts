import * as Sentry from "@sentry/nextjs";

import { sentryBaseOptions } from "../lib/monitoring/sentry";
import { reportUnexpectedError } from "../lib/server/error-reporter";
import { withCorrelation } from "../lib/server/logger";

if (process.env.SENTRY_VALIDATION !== "1" || !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  console.error("Validation is disabled. Set SENTRY_VALIDATION=1 and NEXT_PUBLIC_SENTRY_DSN explicitly.");
  process.exitCode = 1;
} else {
  Sentry.init(sentryBaseOptions);
  const correlationId = `sentry-validation-${crypto.randomUUID()}`;
  withCorrelation(() => {
    reportUnexpectedError(new Error("Sentry validation person@example.com Bearer validation-secret"), {
      action: "controlled_validation",
      component: "monitoring",
      route: "cli:sentry-validation",
      runtime: "node",
    });
  }, correlationId);
  const flushed = await Sentry.flush(5_000);
  console.info(JSON.stringify({ flushed, correlation_id: correlationId, expected_message: "Error (details redacted)" }));
  if (!flushed) process.exitCode = 1;
}
