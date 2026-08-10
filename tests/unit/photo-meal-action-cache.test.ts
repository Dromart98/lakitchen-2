import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  estimate: vi.fn(), getUser: vi.fn(), read: vi.fn(), write: vi.fn(), purge: vi.fn(), key: vi.fn(() => "hash"),
  createAdmin: vi.fn(), admin: { from: vi.fn() },
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdmin }));
vi.mock("@/lib/supabase/auth", () => ({ getAuthenticatedUser: mocks.getUser }));
vi.mock("@/lib/openai/photo-meal-estimation", () => ({ estimatePhotoMealWithOpenAi: mocks.estimate, PHOTO_MEAL_AI_MODEL_DEFAULT: "default-photo-model", PHOTO_MEAL_PROVIDER_CONTRACT: { systemPrompt: "photo-contract" } }));
vi.mock("@/modules/meals/photo-meal-cache", () => ({ createPhotoMealCacheKey: mocks.key, purgeExpiredPhotoMealCache: mocks.purge, readPhotoMealCache: mocks.read, writePhotoMealCache: mocks.write }));
vi.mock("@/lib/openai/text-meal-estimation", () => ({ estimateTextMealWithOpenAi: vi.fn(), TEXT_MEAL_AI_MODEL_DEFAULT: "text-model", TEXT_MEAL_PROVIDER_CONTRACT: { systemPrompt: "text-contract" } }));

import { estimatePhotoMealAction } from "@/app/macros/actions";

const success = { status: "success" as const, suggested_name: "Arroz", ingredients: [], total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, assumptions: [], confidence: "medium" as const };
const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], "meal.jpg", { type: "image/jpeg" });
function form(context = " Pollo ") { const value = new FormData(); value.set("context", context); value.set("photo", jpeg); return value; }

describe("estimatePhotoMealAction cache contract", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ id: "user-a" }); mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(undefined); mocks.purge.mockResolvedValue(undefined); mocks.createAdmin.mockReturnValue(mocks.admin);
    mocks.estimate.mockResolvedValue(success); process.env.OPENAI_API_KEY = "secret"; delete process.env.OPENAI_PHOTO_MEAL_MODEL;
  });

  it("returns a hit without OpenAI or provider configuration", async () => {
    mocks.read.mockResolvedValue(success); delete process.env.OPENAI_API_KEY;
    await expect(estimatePhotoMealAction(form())).resolves.toEqual(success);
    expect(mocks.read).toHaveBeenCalledWith(mocks.admin, "user-a", "hash");
    expect(mocks.estimate).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });

  it("validates before lookup, then caches a successful miss for the session user", async () => {
    await expect(estimatePhotoMealAction(form())).resolves.toEqual(success);
    expect(mocks.key).toHaveBeenCalledWith(new Uint8Array([0xff, 0xd8, 0xff, 1]), "Pollo", "default-photo-model", { systemPrompt: "photo-contract" });
    expect(mocks.estimate).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg;base64,/), "Pollo", { apiKey: "secret", model: "default-photo-model" });
    expect(mocks.write).toHaveBeenCalledWith(mocks.admin, "user-a", "hash", "default-photo-model", { systemPrompt: "photo-contract" }, success);
    expect(mocks.purge).toHaveBeenCalledWith(mocks.admin);
  });

  it.each([{ status: "needs-clarification", message: "No se distingue la comida." }, { status: "error", code: "provider-error" }])("never caches $status", async (result) => {
    mocks.estimate.mockResolvedValue(result); await expect(estimatePhotoMealAction(form())).resolves.toEqual(result);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("isolates by authenticated user and makes every cache operation best-effort", async () => {
    mocks.getUser.mockResolvedValue({ id: "user-b" }); mocks.purge.mockRejectedValue(new Error("down"));
    mocks.read.mockRejectedValue(new Error("down")); mocks.write.mockRejectedValue(new Error("down"));
    await expect(estimatePhotoMealAction(form())).resolves.toEqual(success);
    expect(mocks.read).toHaveBeenCalledWith(mocks.admin, "user-b", "hash"); expect(mocks.estimate).toHaveBeenCalledOnce();
  });

  it("continues with OpenAI if creating the administrative client fails", async () => {
    mocks.createAdmin.mockImplementation(() => { throw new Error("down"); });
    await expect(estimatePhotoMealAction(form())).resolves.toEqual(success);
    expect(mocks.estimate).toHaveBeenCalledOnce(); expect(mocks.read).not.toHaveBeenCalled();
  });

  it("does not create an administrative client before authentication or valid JPEG input", async () => {
    mocks.getUser.mockResolvedValue(null); await expect(estimatePhotoMealAction(form())).resolves.toEqual({ status: "error", code: "unauthenticated" });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ id: "user-a" });
    const invalid = new FormData(); invalid.set("context", "pollo"); invalid.set("photo", new File(["no"], "x.jpg", { type: "image/jpeg" }));
    await expect(estimatePhotoMealAction(invalid)).resolves.toEqual({ status: "error", code: "invalid-photo" });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
});
