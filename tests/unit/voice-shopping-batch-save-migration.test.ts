import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260723000000_save_voice_shopping_batch.sql"), "utf8");

describe("voice shopping batch save migration", () => {
  it("uses a locked, authenticated, atomic strict RPC", () => {
    for (const fragment of [
      "create table public.shopping_list_batch_submissions",
      "primary key (user_id, submission_id)",
      "enable row level security",
      "revoke all on table public.shopping_list_batch_submissions from public, anon, authenticated",
      "security definer",
      "set search_path = ''",
      "auth.uid()",
      "pg_advisory_xact_lock",
      "jsonb_array_length(p_items) not between 1 and 30",
      "jsonb_typeof(p_items) <> 'array'",
      "jsonb_object_keys(v_item)",
      "jsonb_typeof(v_item->'name') <> 'string'",
      "jsonb_typeof(v_item->'quantity') <> 'number'",
      "jsonb_typeof(v_item->'unit') <> 'string'",
      "v_quantity <= 0",
      "is_purchased",
      "false",
      "submission-conflict",
      "already-saved",
      "grant execute on function public.save_voice_shopping_batch(uuid, jsonb) to authenticated",
    ]) expect(migration).toContain(fragment);
    expect(migration).not.toMatch(/service role|execute immediate|format\(/i);
  });
});
