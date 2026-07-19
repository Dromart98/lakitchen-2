"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMealType } from "@/modules/meals/meal-types";
import {
  parseMealBuilderConsumptionLines,
  resolveMealBuilderReturnPath,
  buildMealBuilderResultDestination,
  type MealBuilderReturnPath,
} from "@/modules/meals/meal-builder";

function redirectWithMealError(errorCode: string, _returnPath: MealBuilderReturnPath): never {
  redirect(buildMealBuilderResultDestination("mealError", errorCode));
}

function parseMealBuilderLines(rawLines: FormDataEntryValue | null, returnPath: MealBuilderReturnPath) {
  const result = parseMealBuilderConsumptionLines(rawLines);
  if ("error" in result) redirectWithMealError(result.error, returnPath);

  return result.lines;
}

function getSafeMealBuilderError(error: { code?: string; message: string }) {
  if (error.code === "P0002" || error.message === "Inventory item not found") return "product-not-found";
  if (error.code === "23505" || error.message === "Duplicate meal builder item") return "duplicate-product";
  if (error.code === "22003" || error.message === "Quantity exceeds available stock") return "quantity-too-high";
  if (error.message === "Invalid meal name") return "invalid-name";
  if (error.message === "Invalid meal type") return "invalid-meal-type";
  if (error.message === "Invalid meal builder line count") return "too-many-products";
  if (error.message === "Invalid consumed quantity" || error.message === "Invalid inventory stock") return "invalid-quantity";
  if (error.message === "Incomplete inventory nutrition") return "incomplete-nutrition";
  if (error.message === "Incompatible inventory nutrition unit") return "incompatible-unit";

  return "consume-failed";
}

export async function consumeMealBuilderAndLogMealAction(formData: FormData) {
  const returnPath = resolveMealBuilderReturnPath(formData.get("return_to"));
  const mealName = String(formData.get("meal_name") ?? "").trim();
  const mealType = String(formData.get("meal_type") ?? "").trim();

  if (!mealName || mealName.length > 120) redirectWithMealError("invalid-name", returnPath);
  if (!isMealType(mealType)) redirectWithMealError("invalid-meal-type", returnPath);

  const lines = parseMealBuilderLines(formData.get("lines"), returnPath);

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "meal builder consumption");

  const { error } = await (supabase as any).rpc("consume_meal_builder_items_and_log_meal", {
    p_meal_name: mealName,
    p_meal_type: mealType,
    p_lines: lines,
  }) as { data: string | null; error: { code?: string; message: string } | null };

  if (error) {
    console.warn("Supabase could not consume meal builder items and log a meal:", error.message);
    redirectWithMealError(getSafeMealBuilderError(error), returnPath);
  }

  revalidatePath("/macros");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");

  redirect(buildMealBuilderResultDestination("mealSuccess", "meal-consumed-logged"));
}
