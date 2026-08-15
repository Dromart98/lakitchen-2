import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20260815010000_make_macro_meal_logs_idempotent.sql");

describe("macro meal log idempotency contract", () => {
  it("uses stable client-generated request IDs in manual and AI-only forms", () => {
    const manual = source("components/macros/MacroMealRecorder.tsx");
    const ai = source("components/macros/AiMealEstimationPreview.tsx");

    expect(manual).toContain("useRef(crypto.randomUUID()).current");
    expect(manual).toContain('name="request_id" value={manualRequestId}');
    expect(ai).toContain("id:crypto.randomUUID()");
    expect(ai).toContain('name="request_id" value={requestId}');
  });

  it("serializes first processing and reuses its meal and UTC date on replay", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("return v_existing.meal_log_id");
    expect(migration.match(/insert into public\.daily_meal_logs/g)).toHaveLength(1);
    expect(migration).toContain("statement_timestamp() at time zone 'UTC'");
    expect(migration).toContain("consumed_on date not null");
  });

  it("fingerprints validated content and rejects changed replays", () => {
    for (const field of ["v_name", "p_meal_type", "p_calories", "p_protein_g", "p_carbs_g", "p_fat_g"]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("message = 'idempotency_conflict'");
  });

  it("keeps a private, user-scoped ledger after meal deletion", () => {
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).not.toMatch(/meal_log_id uuid[^\n]*references/i);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.macro_meal_log_requests from public, anon, authenticated");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });
});
