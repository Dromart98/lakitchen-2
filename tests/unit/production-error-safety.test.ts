import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production error safety contracts", () => {
  it("does not render or return raw Supabase errors to users", () => {
    expect(source("app/nutrition-profile/page.tsx")).not.toContain("{error.message}");
    expect(source("app/nutrition-profile/actions.ts")).not.toContain("${error.message}");
    expect(source("components/auth/LoginForm.tsx")).not.toContain("setState({ error: error.message })");
  });
});
