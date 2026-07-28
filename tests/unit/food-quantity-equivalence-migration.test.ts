import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260803000000_create_food_quantity_equivalences.sql", "utf8");

describe("food quantity equivalence migration contract", () => {
  it("defines the private owner-linked model, variants, constraints, and covering index", () => {
    expect(sql).toContain("create table public.food_quantity_equivalences");
    expect(sql).toContain("unique (user_id, food_catalog_item_id, measure_kind, variant_key)");
    expect(sql).toContain("unique (id, user_id)");
    expect(sql).toContain("foreign key (food_catalog_item_id, user_id)");
    expect(sql).toContain("references public.food_catalog_items (id, user_id)");
    expect(sql).toContain("on delete cascade");
    expect(sql).toContain("(food_catalog_item_id, user_id)");
    expect(sql).toContain("canonical_quantity <> 'NaN'::numeric");
    expect(sql).toContain("canonical_quantity <> 'Infinity'::numeric");
    expect(sql).toContain("source = 'user' and user_confirmed");
    expect(sql).toContain("source <> 'user' and not user_confirmed");
  });

  it("allows only owner reads and RPC writes", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.food_quantity_equivalences from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.food_quantity_equivalences to authenticated");
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).not.toMatch(/policy[\s\S]{0,100}for (insert|update|delete)/i);
  });

  it("secures every writer and derives ownership from authentication", () => {
    expect(sql.match(/security definer/g)).toHaveLength(3);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(3);
    expect(sql.match(/v_user_id uuid := auth\.uid\(\)/g)).toHaveLength(3);
    expect(sql).not.toMatch(/\bp_user_id\b/);
    expect(sql.match(/revoke all on function/g)).toHaveLength(3);
    expect(sql.match(/grant execute on function/g)).toHaveLength(3);
    expect(sql).not.toContain("service_role");
  });

  it("serializes proposal/manual creation and protects manual authority by source precedence", () => {
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(sql).toContain("for key share");
    expect(sql).toContain("for update");
    expect(sql).toContain("when 'observed-package' then 3");
    expect(sql).toContain("when 'barcode-memory' then 2");
    expect(sql).toContain("elsif not v_row.user_confirmed");
    expect(sql).toContain("is distinct from");
    expect(sql).toContain("if found and v_row.user_confirmed then");
  });

  it("uses optimistic concurrency and immutable identity for edits and deletion", () => {
    expect(sql.match(/message = 'equivalence_conflict'/g)).toHaveLength(3);
    expect(sql).toContain("v_row.food_catalog_item_id <> p_food_catalog_item_id");
    expect(sql).toContain("v_row.measure_kind <> p_measure_kind");
    expect(sql).toContain("v_row.variant_key <> p_variant_key");
    expect(sql.match(/v_row\.updated_at <> p_expected_updated_at/g)).toHaveLength(2);
    expect(sql).toContain("delete from public.food_quantity_equivalences");
  });
});
