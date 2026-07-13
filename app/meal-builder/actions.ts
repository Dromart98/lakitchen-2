"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMealType } from "@/modules/meals/meal-types";

const MEAL_BUILDER_PATH = "/meal-builder";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type MealBuilderPayloadLine = {
  item_id: unknown;
  consumed_quantity: unknown;
};

function redirectWithMealError(errorCode: string): never {
  redirect(`${MEAL_BUILDER_PATH}?mealError=${errorCode}`);
}

function parseMealBuilderLines(rawLines: FormDataEntryValue | null) {
  if (typeof rawLines !== "string") redirectWithMealError("invalid-lines-json");

  let parsedLines: unknown;

  try {
    parsedLines = JSON.parse(rawLines);
  } catch {
    redirectWithMealError("invalid-lines-json");
  }

  if (!Array.isArray(parsedLines)) redirectWithMealError("invalid-lines-json");
  if (parsedLines.length < 1) redirectWithMealError("invalid-lines");
  if (parsedLines.length > 10) redirectWithMealError("too-many-products");

  const seenItemIds = new Set<string>();

  return parsedLines.map((line) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) redirectWithMealError("invalid-lines-json");

    const { item_id: itemId, consumed_quantity: consumedQuantity } = line as MealBuilderPayloadLine;

    if (typeof itemId !== "string" || !UUID_PATTERN.test(itemId)) {
      redirectWithMealError("product-not-found");
    }

    if (seenItemIds.has(itemId)) redirectWithMealError("duplicate-product");
    seenItemIds.add(itemId);

    const quantity = Number(consumedQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) redirectWithMealError("invalid-quantity");

    return {
      item_id: itemId,
      consumed_quantity: quantity,
    };
  });
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
  const mealName = String(formData.get("meal_name") ?? "").trim();
  const mealType = String(formData.get("meal_type") ?? "").trim();

  if (!mealName || mealName.length > 120) redirectWithMealError("invalid-name");
  if (!isMealType(mealType)) redirectWithMealError("invalid-meal-type");

  const lines = parseMealBuilderLines(formData.get("lines"));

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "meal builder consumption");

  const { error } = await (supabase as any).rpc("consume_meal_builder_items_and_log_meal", {
    p_meal_name: mealName,
    p_meal_type: mealType,
    p_lines: lines,
  }) as { data: string | null; error: { code?: string; message: string } | null };

  if (error) {
    console.warn("Supabase could not consume meal builder items and log a meal:", error.message);
    redirectWithMealError(getSafeMealBuilderError(error));
  }

  revalidatePath(MEAL_BUILDER_PATH);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  revalidatePath("/weekly-summary");

  redirect(`${MEAL_BUILDER_PATH}?mealSuccess=meal-consumed-logged`);
}
