import { describe, expect, it, vi } from "vitest";

import { applyNutritionCatalogToVoiceBatch } from "@/modules/inventory/voice-inventory-catalog";
import type { VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";

const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const EQUIVALENCE_ID = "22222222-2222-4222-8222-222222222222";

function draft(overrides: Partial<VoiceInventoryDraftItem> = {}): VoiceInventoryDraftItem {
  return {
    client_id: "tuna", name: "Atún", quantity: 3, unit: "ud", location: "pantry", category: "protein",
    food_state: "processed", nutrition_basis: "per_100g", calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5,
    confidence: "medium", nutrition_assumptions: "Revisable.", package_count: 3, package_measure_kind: "can",
    package_size: null, package_size_unit: null, total_size: null, total_size_unit: null,
    issues: ["package-size-missing"], ...overrides,
  };
}

function equivalence(overrides: Record<string, unknown> = {}) {
  return {
    id: EQUIVALENCE_ID, food_catalog_item_id: FOOD_ID, measure_kind: "can", variant_key: "lata-143-g",
    display_label: "Lata de 143 g", canonical_quantity: 143, canonical_unit: "g", source: "user",
    user_confirmed: true, updated_at: "2026-07-29T00:00:00.000Z", ...overrides,
  };
}

function client(options: { rows?: unknown[]; foodId?: string | null; equivalenceError?: string } = {}) {
  const calls: Array<{ table: string; filters: Record<string, unknown>; columns: string }> = [];
  const catalogRow = {
    id: "33333333-3333-4333-8333-333333333333", user_id: "user-a", food_catalog_item_id: options.foodId === undefined ? FOOD_ID : options.foodId,
    normalized_name: "atun", aliases: [], food_state: "processed", nutrition_basis: "per_100g",
    calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5, source: "user", external_id: null,
    match_confidence: "high", user_confirmed: true, verified: true, resolved_at: "2026-07-29T00:00:00.000Z",
    refresh_after: null, updated_at: "2026-07-29T00:00:00.000Z",
  };
  return {
    calls,
    from: vi.fn((table: string) => ({
      select(columns: string) {
        const filters: Record<string, unknown> = {};
        const finish = (kind: "in" | "overlaps", column: string, values: string[]) => {
          filters[column] = values;
          calls.push({ table, filters: { ...filters }, columns });
          if (table === "nutrition_catalog_items") return Promise.resolve({ data: kind === "in" ? [catalogRow] : [], error: null });
          return Promise.resolve({ data: options.rows ?? [equivalence()], error: options.equivalenceError ? { message: options.equivalenceError } : null });
        };
        const builder: any = {
          eq(column: string, value: unknown) { filters[column] = value; return builder; },
          in(column: string, values: string[]) { return finish("in", column, values); },
          overlaps(column: string, values: string[]) { return finish("overlaps", column, values); },
        };
        return builder;
      },
    })),
  };
}

async function apply(item = draft(), options: Parameters<typeof client>[0] = {}) {
  const mock = client(options);
  const result = await applyNutritionCatalogToVoiceBatch(mock, "user-a", { status: "needs-clarification", items: [item], message: "Revisa" });
  if (result.status === "error") throw new Error("unexpected result");
  return { item: result.items[0], mock };
}

describe("confirmed package measures in voice inventory", () => {
  it("queries once by user and resolved identities, sanitizes, applies one confirmed measure, and recalculates nutrition", async () => {
    const { item, mock } = await apply(undefined, { rows: [{ corrupt: true }, equivalence()] });
    expect(mock.calls.filter((call) => call.table === "food_quantity_equivalences")).toEqual([expect.objectContaining({
      filters: { user_id: "user-a", user_confirmed: true, food_catalog_item_id: [FOOD_ID] },
    })]);
    expect(item).toMatchObject({ package_size: 143, package_size_unit: "g", total_size: null, total_size_unit: null,
      quantity: 3, unit: "ud", nutrition_basis: "per_unit", calories: 286, review_acknowledged: false });
    expect(item.issues).toContain("saved-package-measure-applied");
    expect(item.issues).not.toContain("package-size-missing");
  });

  it.each([
    ["pending proposal", [equivalence({ source: "observed-package", user_confirmed: false })]],
    ["multiple variants", [equivalence(), equivalence({ id: "44444444-4444-4444-8444-444444444444", variant_key: "lata-160-g", canonical_quantity: 160 })]],
    ["unit equivalence", [equivalence({ canonical_unit: "ud" })]],
    ["corrupt row", [{ corrupt: true }]],
  ])("keeps the missing-size issue for %s", async (_label, rows) => {
    const { item } = await apply(undefined, { rows });
    expect(item.package_size).toBeNull();
    expect(item.issues).toContain("package-size-missing");
    expect(item.issues).not.toContain("saved-package-measure-applied");
  });

  it.each([
    ["individual size", { package_size: 120, package_size_unit: "g" }],
    ["total size", { total_size: 360, total_size_unit: "g" }],
    ["individual size unit", { package_size_unit: "g" }],
    ["total size unit", { total_size_unit: "g" }],
  ])("never overwrites an explicit %s", async (_label, overrides) => {
    const { item } = await apply(draft(overrides as Partial<VoiceInventoryDraftItem>));
    expect(item).toMatchObject(overrides);
    expect(item.issues).not.toContain("saved-package-measure-applied");
  });

  it("does not query equivalences without a catalog identity", async () => {
    const { item, mock } = await apply(undefined, { foodId: null });
    expect(mock.calls.some((call) => call.table === "food_quantity_equivalences")).toBe(false);
    expect(item.issues).toContain("package-size-missing");
  });

  it("preserves the nutritional draft when the optional query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { item } = await apply(undefined, { equivalenceError: "offline" });
    expect(item).toMatchObject({ package_size: null, calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5 });
    expect(item.issues).toContain("package-size-missing");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
