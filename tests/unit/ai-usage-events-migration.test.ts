import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810150000_create_ai_usage_events.sql", "utf8").toLowerCase();

describe("ai_usage_events privacy contract", () => {
  it("is private, server-only, and cascades account deletion", () => {
    expect(sql).toContain("references auth.users(id) on delete cascade");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.ai_usage_events from public, anon, authenticated");
    expect(sql).toContain("grant insert, select, delete on table public.ai_usage_events to service_role");
    expect(sql).not.toMatch(/\b(prompt|email|image|base64|raw_output|description|food_name)\b/);
  });

  it("enforces zero usage for cache hits and stores integer monetary history", () => {
    expect(sql).toContain("ai_usage_events_cache_hit_zero");
    expect(sql).toContain("estimated_cost_usd_micros bigint");
    expect(sql).toContain("pricing_version text not null");
    expect(sql).toContain("created_at timestamptz not null default now()");
  });
});
