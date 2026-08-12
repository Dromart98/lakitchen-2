import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Sentry validation CLI", () => {
  it("runs through tsx without CommonJS top-level-await transform errors", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/validate-sentry.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SENTRY_VALIDATION: "0",
        NEXT_PUBLIC_SENTRY_DSN: "",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Validation is disabled.");
    expect(result.stderr).not.toContain("Transform failed");
    expect(result.stderr).not.toContain("Top-level await");
  });

  it("keeps browser monitoring and controlled validation on the privacy tunnel path", () => {
    const nextConfig = readFileSync("next.config.mjs", "utf8");
    const validator = readFileSync("scripts/validate-sentry.ts", "utf8");

    expect(nextConfig).toContain('tunnelRoute: "/api/monitoring"');
    expect(validator).toContain("SENTRY_VALIDATION_TUNNEL_URL");
    expect(validator).toContain("via_tunnel: Boolean(tunnel)");
  });
});
