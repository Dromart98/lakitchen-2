import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthenticatedUser: vi.fn(async () => ({ id: "user-123" })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));

import { addMealLogAction } from "@/app/dashboard/actions";

function textAiForm() {
  const form = new FormData();
  form.set("return_to", "/macros");
  form.set("meal_mode", "text-ai");
  form.set("request_id", "11111111-1111-4111-8111-111111111111");
  form.set("name", "Pollo con arroz");
  form.set("meal_type", "lunch");
  form.set("calories", "580");
  form.set("protein_g", "53");
  form.set("carbs_g", "79");
  form.set("fat_g", "3.3");
  return form;
}

describe("Text AI meal confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "22222222-2222-4222-8222-222222222222", error: null });
  });

  it("inserts exactly one authenticated meal with validated macros and returns to Text AI", async () => {
    await expect(addMealLogAction(textAiForm())).rejects.toThrow("redirect:/macros?mealMode=text-ai&mealSuccess=meal-created");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("create_macro_meal_log_idempotently", expect.objectContaining({ p_request_id: "11111111-1111-4111-8111-111111111111", p_name: "Pollo con arroz", p_meal_type: "lunch", p_calories: 580, p_protein_g: 53, p_carbs_g: 79, p_fat_g: 3.3 }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/macros");
  });

  it("records decimal manual macros as one meal and returns to the default manual mode", async () => {
    const form = new FormData();
    form.set("return_to", "/macros");
    form.set("meal_mode", "manual");
    form.set("request_id", "33333333-3333-4333-8333-333333333333");
    form.set("name", "Cena manual");
    form.set("meal_type", "dinner");
    form.set("calories", "512.5");
    form.set("protein_g", "31.25");
    form.set("carbs_g", "48.75");
    form.set("fat_g", "18.5");

    await expect(addMealLogAction(form)).rejects.toThrow("redirect:/macros?mealSuccess=meal-created");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("create_macro_meal_log_idempotently", expect.objectContaining({
      p_name: "Cena manual", p_calories: 512.5, p_protein_g: 31.3, p_carbs_g: 48.8, p_fat_g: 18.5,
    }));
  });

  it("keeps an insertion error inside the Text AI destination", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "insert failed" } });
    await expect(addMealLogAction(textAiForm())).rejects.toThrow("redirect:/macros?mealMode=text-ai&mealError=save-failed");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
