import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260722000000_save_voice_inventory_batch.sql"), "utf8");
describe("voice batch migration contract", () => { it("has atomic idempotent, authenticated persistence", () => { for (const text of ["inventory_batch_submissions", "enable row level security", "primary key (user_id, submission_id)", "auth.uid()", "save_voice_inventory_batch", "jsonb_typeof(p_items) <> 'array'", "between 1 and 30", "jsonb_object_keys", "v_quantity <= 0", "pg_advisory_xact_lock", "submission-conflict", "public.inventory_items", "expires_at)", "security invoker", "revoke all on function", "grant execute", "authenticated"]) expect(sql).toContain(text); expect(sql).not.toContain("service_role"); expect(sql).not.toContain("execute format"); }); });
