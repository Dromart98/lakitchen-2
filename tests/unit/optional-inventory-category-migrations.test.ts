import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const barcodeSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260726000000_allow_null_user_barcode_product_category.sql"), "utf8");
const batchSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260726001000_allow_null_category_in_voice_inventory_batch.sql"), "utf8");

describe("optional inventory category migrations", () => {
  it("allows null remembered categories while retaining the recognized-category constraint", () => {
    expect(barcodeSql).toContain("alter column default_category drop not null");
    expect(barcodeSql).toContain("default_category is null");
    expect(barcodeSql).toContain("default_category in ('protein'");
    expect(barcodeSql).not.toMatch(/update public\.user_barcode_products/i);
  });

  it("accepts only JSON null or recognized strings in the atomic voice RPC", () => {
    for (const contract of ["auth.uid()", "between 1 and 30", "pg_advisory_xact_lock", "submission-conflict", "security definer", "set search_path = ''", "jsonb_object_keys", "not in ('string', 'null')", "v_category is not null", "public.inventory_items", "inventory_batch_submissions"]) {
      expect(batchSql).toContain(contract);
    }
    expect(batchSql).toContain("nullif(value->>'category', '')");
    expect(batchSql).not.toContain("v_category is null or");
    expect(batchSql).not.toContain("service_role");
  });
});
