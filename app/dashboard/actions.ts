"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const DASHBOARD_PATH = "/dashboard";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readNonNegativeInteger(formData: FormData, field: string) {
  const rawValue = formData.get(field);

  if (rawValue === null || String(rawValue).trim() === "") {
    redirect(`${DASHBOARD_PATH}?mealError=invalid-macros`);
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    redirect(`${DASHBOARD_PATH}?mealError=invalid-macros`);
  }
  return value;
}

export async function addMealLogAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect(`${DASHBOARD_PATH}?mealError=meal-name-required`);
  }

  if (name.length > 120) {
    redirect(`${DASHBOARD_PATH}?mealError=meal-name-too-long`);
  }

  const calories = readNonNegativeInteger(formData, "calories");
  const proteinG = readNonNegativeInteger(formData, "protein_g");
  const carbsG = readNonNegativeInteger(formData, "carbs_g");
  const fatG = readNonNegativeInteger(formData, "fat_g");
  const consumedOn = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal log");

  const { error } = await supabase.from("daily_meal_logs").insert({
    user_id: user.id,
    name,
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    consumed_on: consumedOn,
  });

  if (error) {
    console.warn("Supabase could not save the dashboard meal log:", error.message);
    redirect(`${DASHBOARD_PATH}?mealError=save-failed`);
  }

  revalidatePath(DASHBOARD_PATH);
  redirect(`${DASHBOARD_PATH}?mealSuccess=meal-created`);
}

export async function deleteMealLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) {
    redirect(`${DASHBOARD_PATH}?mealError=meal-not-found`);
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal deletion");
  const consumedOn = new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any)
    .from("daily_meal_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("consumed_on", consumedOn)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not delete the dashboard meal log:", error.message);
    redirect(`${DASHBOARD_PATH}?mealError=delete-failed`);
  }

  if (!data?.length) {
    redirect(`${DASHBOARD_PATH}?mealError=meal-not-found`);
  }

  revalidatePath(DASHBOARD_PATH);
  redirect(`${DASHBOARD_PATH}?mealSuccess=meal-deleted`);
}
