import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Vercel and Next.js release contracts", () => {
  it("keeps the versioned Vercel configuration free of environment values and deploys only main", () => {
    const vercel = JSON.parse(source("vercel.json")) as { $schema?: string; git?: { deploymentEnabled?: Record<string, boolean> }; env?: unknown; build?: unknown };
    expect(vercel.$schema).toContain("vercel.json");
    expect(vercel.git?.deploymentEnabled).toEqual({ "**": false, main: true });
    expect(vercel.env).toBeUndefined();
    expect(vercel.build).toBeUndefined();
  });

  it("keeps the Next.js Server Action body limit explicit without embedding environment values", () => {
    const nextConfig = source("next.config.mjs");
    expect(nextConfig).toContain('bodySizeLimit: "6mb"');
    expect(nextConfig).not.toMatch(/OPENAI_|SUPABASE_|VERCEL_/);
  });
});
