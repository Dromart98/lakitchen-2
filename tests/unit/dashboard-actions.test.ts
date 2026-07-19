import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`redirect:${destination}`); }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthenticatedUser: vi.fn(async () => ({ id: "user-123" })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: vi.fn(() => ({ insert: mocks.insert })) })) }));

import { addMealLogAction } from "@/app/dashboard/actions";

function textAiForm() {
  const form = new FormData();
  form.set("return_to", "/macros");
  form.set("meal_mode", "text-ai");
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
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("inserts exactly one authenticated meal with validated macros and returns to Text AI", async () => {
    await expect(addMealLogAction(textAiForm())).rejects.toThrow("redirect:/macros?mealMode=text-ai&mealSuccess=meal-created");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-123", name: "Pollo con arroz", meal_type: "lunch", calories: 580, protein_g: 53, carbs_g: 79, fat_g: 3.3 }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/macros");
  });

  it("keeps an insertion error inside the Text AI destination", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "insert failed" } });
    await expect(addMealLogAction(textAiForm())).rejects.toThrow("redirect:/macros?mealMode=text-ai&mealError=save-failed");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
