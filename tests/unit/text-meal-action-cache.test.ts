import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  estimate: vi.fn(), getUser: vi.fn(), read: vi.fn(), write: vi.fn(), purge: vi.fn(), key: vi.fn(() => "hash"), createAdmin: vi.fn(), admin: { from: vi.fn() }, featureEnabled: true,
}));
vi.mock("@/lib/ai/access-policy", () => ({ isAiFeatureEnabled: () => mocks.featureEnabled }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: vi.fn(), rpc: vi.fn() })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdmin }));
vi.mock("@/lib/supabase/auth", () => ({ getAuthenticatedUser: mocks.getUser }));
vi.mock("@/lib/openai/text-meal-estimation", () => ({ estimateTextMealWithOpenAi: mocks.estimate, TEXT_MEAL_AI_MODEL_DEFAULT: "default-model", TEXT_MEAL_PROVIDER_CONTRACT: { systemPrompt: "text-contract" } }));
vi.mock("@/modules/meals/text-meal-cache", () => ({ createTextMealCacheKey: mocks.key, purgeExpiredTextMealCache: mocks.purge, readTextMealCache: mocks.read, writeTextMealCache: mocks.write }));
vi.mock("@/lib/openai/photo-meal-estimation", () => ({ estimatePhotoMealWithOpenAi: vi.fn(), PHOTO_MEAL_PROVIDER_CONTRACT: { systemPrompt: "photo-contract" } }));

import { estimateTextMealAction } from "@/app/macros/actions";

const success = { status: "success" as const, suggested_name: "Arroz", ingredients: [], total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, assumptions: [], confidence: "medium" as const };

describe("estimateTextMealAction cache contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: "user-a" });
    mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(undefined);
    mocks.purge.mockResolvedValue(undefined);
    mocks.createAdmin.mockReturnValue(mocks.admin);
    mocks.estimate.mockResolvedValue(success);
    mocks.featureEnabled = true;
    process.env.OPENAI_API_KEY = "secret";
    delete process.env.OPENAI_TEXT_MEAL_MODEL;
  });

  it("returns a same-user cache hit without calling OpenAI, even if the provider key is absent", async () => {
    mocks.read.mockResolvedValue(success);
    delete process.env.OPENAI_API_KEY;
    await expect(estimateTextMealAction({ description: "100 g arroz" })).resolves.toEqual(success);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), "user-a", "hash");
    expect(mocks.read).toHaveBeenCalledWith(mocks.admin, "user-a", "hash");
    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("blocks a disabled feature before reading or returning a cache hit", async () => {
    mocks.featureEnabled = false;
    mocks.read.mockResolvedValue(success);
    await expect(estimateTextMealAction({ description: "100 g arroz" })).resolves.toEqual({ status: "error", code: "ai-feature-disabled" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.estimate).not.toHaveBeenCalled();
  });

  it("on a miss calls OpenAI with store-neutral provider options and caches only success", async () => {
    await expect(estimateTextMealAction({ description: "100 g arroz" })).resolves.toEqual(success);
    expect(mocks.key).toHaveBeenCalledWith("100 g arroz", "default-model", { systemPrompt: "text-contract" });
    expect(mocks.estimate).toHaveBeenCalledWith("100 g arroz", expect.objectContaining({ apiKey: "secret", model: "default-model", fetchImpl: expect.any(Function) }));
    expect(mocks.write).toHaveBeenCalledWith(expect.anything(), "user-a", "hash", "default-model", { systemPrompt: "text-contract" }, success);
    expect(mocks.purge).toHaveBeenCalledWith(mocks.admin);
  });

  it.each([
    { status: "needs-clarification", message: "Indica una cantidad aproximada." },
    { status: "error", code: "provider-error" },
  ])("does not cache $status results", async (providerResult) => {
    mocks.estimate.mockResolvedValue(providerResult);
    await expect(estimateTextMealAction({ description: "arroz" })).resolves.toEqual(providerResult);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("isolates lookup by authenticated user and keeps cache failures best-effort", async () => {
    mocks.getUser.mockResolvedValue({ id: "user-b" });
    mocks.read.mockRejectedValue(new Error("cache unavailable"));
    mocks.write.mockRejectedValue(new Error("cache unavailable"));
    await expect(estimateTextMealAction({ description: "100 g arroz" })).resolves.toEqual(success);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), "user-b", "hash");
    expect(mocks.estimate).toHaveBeenCalledTimes(1);
  });

  it("continues with OpenAI when the server-only cache client cannot be created", async () => {
    mocks.createAdmin.mockImplementation(() => { throw new Error("missing cache configuration"); });
    await expect(estimateTextMealAction({ description: "100 g arroz" })).resolves.toEqual(success);
    expect(mocks.estimate).toHaveBeenCalledWith("100 g arroz", expect.objectContaining({ apiKey: "secret", model: "default-model", fetchImpl: expect.any(Function) }));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it("never accepts a cache owner from browser input", async () => {
    await estimateTextMealAction({ description: "100 g arroz", user_id: "forged-user" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.estimate).not.toHaveBeenCalled();
  });
});
