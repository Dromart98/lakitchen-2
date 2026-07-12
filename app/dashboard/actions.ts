"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const maxMealNameLength = 120;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTodayUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

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

  if (!name || name.length > maxMealNameLength) {
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
    consumed_on: getTodayUtcDateKey(),
  });

  if (error) {
    console.warn("Supabase could not save the dashboard meal log:", error.message);
    redirect("/dashboard?mealError=save-failed");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?mealSuccess=meal-created");
}

export async function deleteMealLogAction(formData: FormData) {
  const mealId = String(formData.get("id") ?? "").trim();

  if (!uuidPattern.test(mealId)) {
    redirect("/dashboard?mealError=meal-not-found");
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal log deletion");

  const { data, error } = await (supabase as any)
    .from("daily_meal_logs")
    .delete()
    .eq("id", mealId)
    .eq("user_id", user.id)
    .eq("consumed_on", getTodayUtcDateKey())
    .select("id")
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not delete the dashboard meal log:", error.message);
    redirect("/dashboard?mealError=delete-failed");
  }

  if (!data) {
    redirect("/dashboard?mealError=meal-not-found");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?mealSuccess=meal-deleted");
}
