import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260810000000_create_user_text_meal_analysis_cache.sql"), "utf8");

describe("text meal cache database access", () => {
  it("keeps the table server-only with RLS forced as defense in depth", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.user_text_meal_analysis_cache from authenticated");
    expect(migration).not.toMatch(/create policy[\s\S]*to authenticated/i);
    expect(migration).toContain("grant select, insert, update, delete on table public.user_text_meal_analysis_cache to service_role");
  });
});
