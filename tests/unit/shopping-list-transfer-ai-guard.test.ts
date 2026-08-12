import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  resolve: vi.fn(),
  quotaRpc: vi.fn(),
  usageRows: [] as Record<string, unknown>[],
  revalidate: vi.fn(),
  usageError: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/ai/access-policy", () => ({ isAiFeatureEnabled: () => mocks.featureEnabled }));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthenticatedUser: vi.fn(async () => ({ id: "user-a" })) }));
vi.mock("@/lib/nutrition/catalog-resolver", () => ({ resolveInventoryNutritionForUser: mocks.resolve }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.quotaRpc,
    from: () => ({ insert: async (row: Record<string, unknown>) => { mocks.usageRows.push(row); return { error: mocks.usageError }; } }),
  }),
}));

const inventoryId = "123e4567-e89b-42d3-a456-426614174000";
const shoppingId = "223e4567-e89b-42d3-a456-426614174000";
const transferredItem = {
  id: inventoryId, name: "Arroz", quantity: 100, unit: "g", category: "carbohydrate",
  nutrition_basis: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, food_catalog_item_id: null,
};

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "is", "update"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

const transferRpc = vi.fn(async () => ({ data: inventoryId, error: null }));
const inventoryRead = query({ data: transferredItem, error: null });
const inventoryUpdate = query({ data: [{ id: inventoryId }], error: null });
inventoryUpdate.select = vi.fn(async () => ({ data: [{ id: inventoryId }], error: null }));
const supabase = {
  rpc: transferRpc,
  from: vi.fn(() => {
    const builder = inventoryRead;
    builder.update = vi.fn(() => inventoryUpdate);
    return builder;
  }),
};

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => supabase) }));

import { transferShoppingListItemToInventoryAction } from "@/app/shopping-list/actions";

function form() {
  const data = new FormData();
  data.set("id", shoppingId);
  data.set("location", "pantry");
  return data;
}

const pendingRedirect = /redirect:\/shopping-list\?shoppingListSuccess=item-transferred-macros-pending/;

describe("shopping transfer AI guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usageRows.length = 0;
    mocks.featureEnabled = true;
    mocks.usageError = null;
    mocks.quotaRpc.mockResolvedValue({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
  });

  it("keeps a catalog resolution quota-free", async () => {
    mocks.resolve.mockResolvedValue({
      status: "resolved", nutritionBasis: "per_100g", calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3,
      assumptions: [], foodCatalogItemId: null, meteringCacheHit: true, provenance: { source: "user" },
    });
    await expect(transferShoppingListItemToInventoryAction(form())).rejects.toThrow(/item-transferred-with-nutrition/);
    expect(mocks.quotaRpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reserves once when resolution falls back to the provider", async () => {
    mocks.resolve.mockImplementation(async (_client, _userId, _input, options) => {
      await options.fetchImpl("https://api.openai.com/v1/responses");
      return { status: "unresolved", reason: "provider-error", meteringCacheHit: false };
    });
    await expect(transferShoppingListItemToInventoryAction(form())).rejects.toThrow(pendingRedirect);
    expect(mocks.quotaRpc).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(transferRpc).toHaveBeenCalledOnce();
  });

  it("keeps the transferred item pending when the daily limit blocks the fallback", async () => {
    mocks.quotaRpc.mockResolvedValue({ data: false, error: null });
    mocks.resolve.mockImplementation(async (_client, _userId, _input, options) => {
      await options.fetchImpl("https://api.openai.com/v1/responses");
      return { status: "unresolved", reason: "provider-error", meteringCacheHit: false };
    });
    await expect(transferShoppingListItemToInventoryAction(form())).rejects.toThrow(pendingRedirect);
    expect(fetch).not.toHaveBeenCalled();
    expect(transferRpc).toHaveBeenCalledOnce();
  });

  it("keeps the transferred item pending without resolving or reserving when disabled", async () => {
    mocks.featureEnabled = false;
    await expect(transferShoppingListItemToInventoryAction(form())).rejects.toThrow(pendingRedirect);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.quotaRpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(transferRpc).toHaveBeenCalledOnce();
  });

  it("keeps one correlation ID across the action and metering layers and separates operations", async () => {
    mocks.usageError = { message: "private database response" };
    mocks.resolve.mockResolvedValue({ status: "unresolved", reason: "provider-error", meteringCacheHit: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(transferShoppingListItemToInventoryAction(form())).rejects.toThrow(pendingRedirect);
    await expect(transferShoppingListItemToInventoryAction(form())).rejects.toThrow(pendingRedirect);

    const records = warn.mock.calls.map(([line]) => JSON.parse(String(line).slice(String(line).indexOf("{"))));
    const operationIds = records.reduce<string[][]>((groups, record) => {
      if (record.event === "usage_metering_write_failed") groups.push([record.correlation_id]);
      else groups.at(-1)?.push(record.correlation_id);
      return groups;
    }, []);
    expect(operationIds).toHaveLength(2);
    expect(operationIds[0]).toHaveLength(2);
    expect(new Set(operationIds[0]).size).toBe(1);
    expect(new Set(operationIds[1]).size).toBe(1);
    expect(operationIds[0][0]).not.toBe(operationIds[1][0]);
    expect(JSON.stringify(records)).not.toContain("private database response");
    warn.mockRestore();
  });
});
