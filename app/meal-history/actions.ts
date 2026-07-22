"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getTodayUtcDate,
  isPastMealHistoryDate,
  isValidMealHistoryDate,
} from "@/modules/meals/meal-date";
import { normalizeMealType } from "@/modules/meals/meal-types";
import { isMealLogId } from "@/modules/meals/meal-validation";

const MEAL_HISTORY_PATH = "/meal-history";

function redirectMealHistoryError(sourceDate: string, error: string): never {
  const params = new URLSearchParams({ date: sourceDate, mealError: error });
  redirect(`${MEAL_HISTORY_PATH}?${params.toString()}`);
}

type RepeatMealLogRow = {
  id: string;
  name: string;
  meal_type: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  consumed_on: string;
};

export async function repeatMealLogTodayAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const sourceDate = String(formData.get("source_date") ?? "").trim();
  const today = getTodayUtcDate();

  const safeReturnDate = isValidMealHistoryDate(sourceDate, today)
    ? sourceDate
    : today;

  if (!isPastMealHistoryDate(sourceDate, today)) {
    redirectMealHistoryError(
      safeReturnDate,
      "repeat-not-available",
    );
  }

  if (!isMealLogId(id)) {
    redirectMealHistoryError(
      safeReturnDate,
      "repeat-not-found",
    );
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(
    supabase,
    "repeat meal log today",
  );

  const { data: sourceMeal, error: sourceMealError } = await supabase
    .from("daily_meal_logs")
    .select("id, name, meal_type, calories, protein_g, carbs_g, fat_g, consumed_on")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("consumed_on", sourceDate)
    .lt("consumed_on", today)
    .maybeSingle() as { data: RepeatMealLogRow | null; error: { message: string } | null };

  if (sourceMealError) {
    console.warn("Supabase could not load the meal log to repeat:", sourceMealError.message);
    redirectMealHistoryError(sourceDate, "repeat-load-failed");
  }

  if (!sourceMeal) {
    redirectMealHistoryError(sourceDate, "repeat-not-found");
  }

  const { error: insertError } = await supabase.from("daily_meal_logs").insert({
    user_id: user.id,
    name: sourceMeal.name,
    meal_type: normalizeMealType(sourceMeal.meal_type),
    calories: sourceMeal.calories,
    protein_g: sourceMeal.protein_g,
    carbs_g: sourceMeal.carbs_g,
    fat_g: sourceMeal.fat_g,
    consumed_on: today,
  });

  if (insertError) {
    console.warn("Supabase could not save the repeated meal log:", insertError.message);
    redirectMealHistoryError(sourceDate, "repeat-save-failed");
  }

  revalidatePath("/dashboard");
  revalidatePath("/macros");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");
  redirect("/dashboard?mealSuccess=meal-repeated");
}
