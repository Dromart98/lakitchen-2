"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function readNonNegativeInteger(formData: FormData, field: string) {
  const rawValue = formData.get(field);

  if (rawValue === null || String(rawValue).trim() === "") {
    throw new Error("Los macros deben ser números enteros de 0 o más.");
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Los macros deben ser números enteros de 0 o más.");
  }
  return value;
}

export async function addMealLogAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect("/dashboard?mealError=meal-name-required");
  }

  let calories: number;
  let proteinG: number;
  let carbsG: number;
  let fatG: number;

  try {
    calories = readNonNegativeInteger(formData, "calories");
    proteinG = readNonNegativeInteger(formData, "protein_g");
    carbsG = readNonNegativeInteger(formData, "carbs_g");
    fatG = readNonNegativeInteger(formData, "fat_g");
  } catch {
    redirect("/dashboard?mealError=invalid-macros");
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal log");

  const { error } = await supabase.from("daily_meal_logs").insert({
    user_id: user.id,
    name,
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
  });

  if (error) {
    console.warn("Supabase could not save the dashboard meal log:", error.message);
    redirect("/dashboard?mealError=save-failed");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
