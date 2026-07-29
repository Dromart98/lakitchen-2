import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260803000000_create_food_quantity_equivalences.sql", "utf8");

describe("food quantity equivalence migration contract", () => {
  it("defines the private owner-linked table, constraints, variants, and cascade", () => {
    expect(sql).toContain("create table public.food_quantity_equivalences");
    expect(sql).toContain("unique (user_id, food_catalog_item_id, measure_kind, variant_key)");
    expect(sql).toContain("unique (id, user_id)");
    expect(sql).toContain("foreign key (food_catalog_item_id, user_id)");
    expect(sql).toContain("references public.food_catalog_items (id, user_id) on delete cascade");
    expect(sql).toContain("food_quantity_equivalences_food_owner_idx");
    expect(sql).toContain("(food_catalog_item_id, user_id)");
    expect(sql).toContain("canonical_quantity > 0 and canonical_quantity < 'Infinity'::numeric");
    expect(sql).toContain("(source = 'user') = user_confirmed");
    expect(sql).toContain("variant_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
  });

  it("allows only owner reads and RPC writes", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.food_quantity_equivalences from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.food_quantity_equivalences to authenticated");
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    const policies = sql.slice(sql.indexOf("create policy"), sql.indexOf("create trigger"));
    expect(policies).not.toMatch(/for (insert|update|delete)/);
    expect(sql.match(/security definer set search_path = ''/g)).toHaveLength(3);
    expect(sql.match(/revoke all on function/g)).toHaveLength(3);
    expect(sql.match(/grant execute on function/g)).toHaveLength(3);
  });

  it("derives the authenticated owner, validates identity ownership, and locks race keys", () => {
    expect(sql).not.toMatch(/p_user_id/);
    expect(sql.match(/v_user_id uuid := auth\.uid\(\)/g)).toHaveLength(3);
    expect(sql.match(/if v_user_id is null/g)).toHaveLength(3);
    expect(sql.match(/food_catalog_items where id = p_food_catalog_item_id and user_id = v_user_id for key share/g)).toHaveLength(2);
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(sql).toContain("for update");
  });

  it("implements proposal authority without touching ignored rows", () => {
    const proposal = sql.slice(sql.indexOf("create function public.save_food_quantity_equivalence_proposal"), sql.indexOf("create function public.save_confirmed"));
    expect(proposal).toContain("if v_row.user_confirmed then return v_row");
    expect(proposal).toContain("when 'observed-package' then 3 when 'barcode-memory' then 2 else 1");
    expect(proposal).toContain("if v_new_priority < v_old_priority then return v_row");
    expect(proposal).toContain("if v_row.source = p_source");
    expect(proposal).toContain("return v_row");
  });

  it("protects manual creation, immutable identity, optimistic edits and deletes", () => {
    expect(sql.match(/message = 'equivalence_conflict'/g)).toHaveLength(3);
    expect(sql).toContain("v_row.food_catalog_item_id <> p_food_catalog_item_id");
    expect(sql).toContain("v_row.measure_kind <> p_measure_kind");
    expect(sql).toContain("v_row.variant_key <> p_variant_key");
    expect(sql.match(/updated_at is distinct from p_expected_updated_at/g)).toHaveLength(2);
    expect(sql).toContain("source = 'user', user_confirmed = true");
    expect(sql).toContain("delete from public.food_quantity_equivalences");
  });
});
