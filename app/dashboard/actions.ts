"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMealLogId, validateMealLogInput } from "@/modules/meals/meal-validation";

const DASHBOARD_PATH = "/dashboard";
const MACROS_PATH = "/macros";

function getMealReturnPath(formData: FormData) {
  return formData.get("return_to") === MACROS_PATH ? MACROS_PATH : DASHBOARD_PATH;
}

function redirectMealValidationError(error: string, destination = DASHBOARD_PATH): never {
  redirect(`${destination}?mealError=${error}`);
}


export async function addMealLogAction(formData: FormData) {
  const destination = getMealReturnPath(formData);
  const mealInput = validateMealLogInput(formData);

  if ("error" in mealInput) {
    redirectMealValidationError(mealInput.error, destination);
  }

  const { name, mealType, calories, proteinG, carbsG, fatG } = mealInput.value;
  const consumedOn = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal log");

  const { error } = await supabase.from("daily_meal_logs").insert({
    user_id: user.id,
    name,
    meal_type: mealType,
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    consumed_on: consumedOn,
  });

  if (error) {
    console.warn("Supabase could not save the dashboard meal log:", error.message);
    redirect(`${destination}?mealError=save-failed`);
  }

  revalidatePath(DASHBOARD_PATH);
  revalidatePath(MACROS_PATH);
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");
  redirect(`${destination}?mealSuccess=meal-created`);
}

export async function updateMealLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isMealLogId(id)) {
    redirect(`${DASHBOARD_PATH}?mealError=meal-not-found`);
  }

  const mealInput = validateMealLogInput(formData);
  const editPath = `${DASHBOARD_PATH}/meals/${id}/edit`;

  if ("error" in mealInput) {
    redirectMealValidationError(mealInput.error, editPath);
  }

  const { name, mealType, calories, proteinG, carbsG, fatG } = mealInput.value;
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal update");
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any)
    .from("daily_meal_logs")
    .update({
      name,
      meal_type: mealType,
      calories,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("consumed_on", today)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not update the dashboard meal log:", error.message);
    redirect(`${editPath}?mealError=update-failed`);
  }

  if (!data?.length) {
    redirect(`${DASHBOARD_PATH}?mealError=meal-not-found`);
  }

  revalidatePath(DASHBOARD_PATH);
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");
  redirect(`${DASHBOARD_PATH}?mealSuccess=meal-updated`);
}

export async function deleteMealLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isMealLogId(id)) {
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
