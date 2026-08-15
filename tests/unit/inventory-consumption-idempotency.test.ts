import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260815020000_make_direct_inventory_consumption_idempotent.sql",
  "utf8",
);
const actions = readFileSync("app/inventory/actions.ts", "utf8");
const form = readFileSync("components/inventory/InventoryConsumeForm.tsx", "utf8");

describe("direct inventory consumption idempotency", () => {
  it("keeps the legacy RPCs and adds request-aware overloads", () => {
    expect(migration).toContain("public.consume_inventory_item(p_item_id, p_quantity)");
    expect(migration).toContain(
      "public.consume_inventory_item_and_log_meal(\n    p_item_id, p_consumed_quantity, p_meal_type\n  )",
    );
    expect(migration).toContain("public.consume_inventory_item(uuid, numeric, uuid)");
    expect(migration).toContain(
      "public.consume_inventory_item_and_log_meal(uuid, numeric, text, uuid)",
    );
  });

  it("uses a private durable ledger without inventory or meal foreign keys", () => {
    expect(migration).toMatch(
      /inventory_consumption_requests[\s\S]*user_id uuid not null references auth\.users\(id\) on delete cascade/i,
    );
    expect(migration).toContain(
      "revoke all on table public.inventory_consumption_requests from public, anon, authenticated",
    );
    expect(migration).not.toMatch(/references public\.(inventory_items|daily_meal_logs)/i);
    expect(migration).toContain("remaining_quantity numeric not null");
  });

  it("serializes request identities and rejects a changed operation or payload", () => {
    expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(migration.match(/message = 'idempotency_conflict'/g)).toHaveLength(2);
    expect(migration).toContain("'operation', 'consume'");
    expect(migration).toContain("'operation', 'consume_and_log_meal'");
    expect(migration).toContain("'item_id', p_item_id, 'quantity', p_quantity");
    expect(migration).toContain("'meal_type', p_meal_type");
    expect(migration.match(/return v_existing\.remaining_quantity/g)).toHaveLength(2);
  });

  it("runs both wrappers as locked-down security definers", () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("Untrusted idempotent inventory consumption RPC owner");
    expect(migration.match(/grant execute .* to authenticated/g)).toHaveLength(2);
  });

  it("submits stable and independent request IDs from the two forms", () => {
    expect(form).toContain("const [consumeRequestId] = useState(() => crypto.randomUUID())");
    expect(form).toContain("const [consumeAndLogRequestId] = useState(() => crypto.randomUUID())");
    expect(form).toContain('name="request_id" type="hidden" value={consumeRequestId}');
    expect(form).toContain('name="request_id" type="hidden" value={consumeAndLogRequestId}');
  });

  it("validates and forwards the client request ID in both server actions", () => {
    expect(actions.match(/formData\.get\("request_id"\)/g)).toHaveLength(2);
    expect(actions.match(/p_request_id: requestId/g)).toHaveLength(2);
    expect(actions.match(/if \(!isUuid\(requestId\)\)/g)).toHaveLength(2);
  });
});
