import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  resolve: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/access-policy", () => ({ isAiFeatureEnabled: () => mocks.featureEnabled }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthenticatedUser: vi.fn(async () => ({ id: "user-a" })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) }) }));
vi.mock("@/lib/nutrition/catalog-resolver", () => ({ resolveInventoryNutritionForUser: mocks.resolve }));

import { estimateInventoryNutritionAction } from "@/app/inventory/actions";

const input = { name: "Arroz", quantity: 100, unit: "g", category: "carbohydrate" } as const;
const deterministicResult = {
  status: "resolved" as const,
  nutritionBasis: "per_100g" as const,
  calories: 130,
  proteinG: 2.7,
  carbsG: 28,
  fatG: 0.3,
  assumptions: [],
  foodCatalogItemId: null,
  meteringCacheHit: true,
  provenance: { source: "user" as const },
};

describe("inventory AI feature policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureEnabled = true;
    mocks.resolve.mockResolvedValue(deterministicResult);
  });

  it("blocks a disabled feature before deterministic catalog resolution", async () => {
    mocks.featureEnabled = false;
    await expect(estimateInventoryNutritionAction(input)).resolves.toMatchObject({ status: "error", code: "ai-feature-disabled" });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps an enabled deterministic resolution quota-free", async () => {
    await expect(estimateInventoryNutritionAction(input)).resolves.toMatchObject({ status: "success", estimate: { calories: 130 } });
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
