import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }),
  revalidatePath: vi.fn(), rpc: vi.fn(), requireAuthenticatedUser: vi.fn(), parseLines: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/auth", () => ({ getAuthenticatedUser: vi.fn(), requireAuthenticatedUser: mocks.requireAuthenticatedUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));
vi.mock("@/modules/meals/meal-builder", () => ({ parseMealBuilderConsumptionLines: mocks.parseLines }));
vi.mock("@/modules/meals/meal-types", () => ({ isMealType: (value: string) => value === "lunch" }));
vi.mock("@/lib/openai/text-meal-estimation", () => ({ estimateTextMealWithOpenAi: vi.fn() }));
vi.mock("@/lib/openai/photo-meal-estimation", () => ({ estimatePhotoMealWithOpenAi: vi.fn() }));
vi.mock("@/modules/meals/photo-meal-ai", () => ({ photoMealContextSchema: { safeParse: vi.fn() }, validatePhotoMealFile: vi.fn() }));
vi.mock("@/modules/meals/text-meal-ai", () => ({ textMealRequestSchema: { safeParse: vi.fn() } }));

import { consumeAiMealInventoryAction } from "@/app/macros/actions";
const validLines = [{ item_id: "11111111-1111-4111-8111-111111111111", consumed_quantity: 100 }];
function form(mode = "text-ai") { const data = new FormData(); data.set("meal_mode", mode); data.set("meal_name", "Comida"); data.set("meal_type", "lunch"); data.set("lines", "payload"); return data; }
describe("consumeAiMealInventoryAction", () => {
 beforeEach(() => { vi.clearAllMocks(); mocks.parseLines.mockReturnValue({ lines: validLines }); mocks.requireAuthenticatedUser.mockResolvedValue({ id: "user" }); mocks.rpc.mockResolvedValue({ error: null }); });
 it("authenticates, parses and calls the atomic RPC once with only its contract fields", async () => { await expect(consumeAiMealInventoryAction(form())).rejects.toThrow("redirect:/macros?mealMode=text-ai&mealSuccess=meal-consumed-logged#registrar-comida"); expect(mocks.parseLines).toHaveBeenCalledWith("payload"); expect(mocks.requireAuthenticatedUser).toHaveBeenCalledTimes(1); expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.rpc).toHaveBeenCalledWith("consume_meal_builder_items_and_log_meal", { p_meal_name: "Comida", p_meal_type: "lunch", p_lines: validLines }); expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual(["/macros", "/inventory", "/dashboard", "/meal-history", "/weekly-summary"]); });
 it("keeps photo mode in its success destination", async () => { await expect(consumeAiMealInventoryAction(form("photo-ai"))).rejects.toThrow("redirect:/macros?mealMode=photo-ai&mealSuccess=meal-consumed-logged#registrar-comida"); expect(mocks.rpc).toHaveBeenCalledTimes(1); });
 it("rejects manipulated modes before parsing, authentication or consuming", async () => { await expect(consumeAiMealInventoryAction(form("manual"))).rejects.toThrow("redirect:/macros?mealError=invalid-meal-mode#registrar-comida"); expect(mocks.parseLines).not.toHaveBeenCalled(); expect(mocks.requireAuthenticatedUser).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); });
 it("rejects invalid name, meal type and parsed lines without calling the RPC", async () => { const noName=form(); noName.set("meal_name", ""); await expect(consumeAiMealInventoryAction(noName)).rejects.toThrow("mealError=invalid-name"); const badType=form(); badType.set("meal_type", "bad"); await expect(consumeAiMealInventoryAction(badType)).rejects.toThrow("mealError=invalid-meal-type"); mocks.parseLines.mockReturnValue({ error: "invalid-lines" }); await expect(consumeAiMealInventoryAction(form())).rejects.toThrow("mealError=invalid-lines"); expect(mocks.rpc).not.toHaveBeenCalled(); });
});
