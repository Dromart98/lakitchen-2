import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260810100000_create_user_photo_meal_analysis_cache.sql"), "utf8");

describe("photo meal cache database access", () => {
  it("is service-role-only with forced RLS and cascading ownership", () => {
    expect(sql).toMatch(/references auth\.users\(id\) on delete cascade/i);
    expect(sql).toContain("enable row level security"); expect(sql).toContain("force row level security");
    for (const role of ["public", "anon", "authenticated"]) expect(sql).toContain(`revoke all on table public.user_photo_meal_analysis_cache from ${role}`);
    expect(sql).toContain("grant select, insert, update, delete on table public.user_photo_meal_analysis_cache to service_role");
    expect(sql).not.toMatch(/create policy/i);
  });

  it("stores only fingerprint metadata and success projections", () => {
    expect(sql).toContain("result ->> 'status' = 'success'");
    expect(sql).not.toMatch(/\b(image|photo|base64|context|secret|api_key)\s+(text|jsonb|bytea)/i);
  });
});
