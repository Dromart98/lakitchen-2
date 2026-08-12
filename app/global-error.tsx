"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import ErrorPage from "./error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setTag("component", "global_error");
      scope.setTag("runtime", "browser");
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <html lang="es">
      <body><ErrorPage error={error} reset={reset} /></body>
    </html>
  );
}
