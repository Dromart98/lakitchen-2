"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isInventoryCategory } from "@/modules/inventory/inventory-categories";
import {
  hasInventoryNutritionValues,
  isInventoryNutritionBasis,
  parseOptionalInventoryNutritionNumber,
} from "@/modules/inventory/inventory-nutrition";
import { isMealType } from "@/modules/meals/meal-types";

type InventoryLocation = "pantry" | "fridge" | "freezer";
type InventoryUnit = "ud" | "g" | "kg" | "ml" | "l";

const INVENTORY_PATH = "/inventory";
const inventoryLocations = ["pantry", "fridge", "freezer"] as const;
const inventoryUnits = ["ud", "g", "kg", "ml", "l"] as const;

function isInventoryLocation(value: string): value is InventoryLocation {
  return inventoryLocations.includes(value as InventoryLocation);
}

function isInventoryUnit(value: string): value is InventoryUnit {
  return inventoryUnits.includes(value as InventoryUnit);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOptionalExpirationDate(formData: FormData) {
  const rawValue = String(formData.get("expires_at") ?? "").trim();

  if (!rawValue) return null;

  const parsedDate = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || rawValue !== parsedDate.toISOString().slice(0, 10)) {
    redirect(`${INVENTORY_PATH}?inventoryError=invalid-expires-at`);
  }

  return rawValue;
}

function getOptionalNutritionNumber(formData: FormData, field: string, errorCode: string) {
  const value = parseOptionalInventoryNutritionNumber(formData.get(field));

  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    redirect(`${INVENTORY_PATH}?inventoryError=${errorCode}`);
  }

  return value;
}

function getOptionalNutritionFields(formData: FormData) {
  const rawBasis = String(formData.get("nutrition_basis") ?? "").trim();
  const calories = getOptionalNutritionNumber(formData, "calories", "invalid-calories");
  const proteinG = getOptionalNutritionNumber(formData, "protein_g", "invalid-protein");
  const carbsG = getOptionalNutritionNumber(formData, "carbs_g", "invalid-carbs");
  const fatG = getOptionalNutritionNumber(formData, "fat_g", "invalid-fat");
  const hasNutritionValues = hasInventoryNutritionValues([calories, proteinG, carbsG, fatG]);

  if (!rawBasis) {
    if (hasNutritionValues) redirect(`${INVENTORY_PATH}?inventoryError=missing-nutrition-basis`);

    return { nutritionBasis: null, calories, proteinG, carbsG, fatG };
  }

  if (!isInventoryNutritionBasis(rawBasis)) {
    redirect(`${INVENTORY_PATH}?inventoryError=invalid-nutrition-basis`);
  }

  return { nutritionBasis: rawBasis, calories, proteinG, carbsG, fatG };
}

function getValidatedInventoryFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "");
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");
  const category = String(formData.get("category") ?? "").trim();

  if (!name) redirect(`${INVENTORY_PATH}?inventoryError=name-required`);
  if (name.length > 120) redirect(`${INVENTORY_PATH}?inventoryError=name-too-long`);
  if (!Number.isFinite(quantity) || quantity <= 0) redirect(`${INVENTORY_PATH}?inventoryError=invalid-quantity`);
  if (!isInventoryUnit(unit)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-unit`);
  if (!isInventoryLocation(location)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-location`);
  if (!isInventoryCategory(category)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-category`);

  const nutritionFields = getOptionalNutritionFields(formData);

  return {
    name,
    quantity,
    unit,
    location,
    category,
    expiresAt: getOptionalExpirationDate(formData),
    ...nutritionFields,
  };
}

export async function addInventoryItemAction(formData: FormData) {
  const { name, quantity, unit, location, category, expiresAt, nutritionBasis, calories, proteinG, carbsG, fatG } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item creation");

  const { error } = await (supabase as any).from("inventory_items").insert({
    user_id: user.id,
    name,
    quantity,
    unit,
    location,
    category,
    nutrition_basis: nutritionBasis,
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    expires_at: expiresAt,
  });

  if (error) {
    console.warn("Supabase could not save the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=save-failed`);
  }

  revalidatePath(INVENTORY_PATH);
  redirect(`${INVENTORY_PATH}?inventorySuccess=item-created`);
}

export async function updateInventoryItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=update-not-found`);

  const { name, quantity, unit, location, category, expiresAt, nutritionBasis, calories, proteinG, carbsG, fatG } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item update");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .update({
      name,
      quantity,
      unit,
      location,
      category,
      nutrition_basis: nutritionBasis,
      calories,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
      expires_at: expiresAt,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not update the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=update-failed`);
  }

  if (!data?.length) redirect(`${INVENTORY_PATH}?inventoryError=update-not-found`);

  revalidatePath(INVENTORY_PATH);
  redirect(`${INVENTORY_PATH}?inventorySuccess=item-updated`);
}

export async function consumeInventoryItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const consumedQuantity = Number(formData.get("consumed_quantity"));

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=consume-not-found`);
  if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
    redirect(`${INVENTORY_PATH}?inventoryError=invalid-quantity`);
  }

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "inventory item consumption");

  const { data, error } = await (supabase as any).rpc("consume_inventory_item", {
    p_item_id: id,
    p_quantity: consumedQuantity,
  }) as { data: number | string | null; error: { code?: string; message: string } | null };

  if (error) {
    console.warn("Supabase could not consume the inventory item:", error.message);

    if (error.code === "22003") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-too-much`);
    }

    if (error.code === "P0002") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-not-found`);
    }

    redirect(`${INVENTORY_PATH}?inventoryError=consume-failed`);
  }

  const remainingQuantity = Number(data);

  revalidatePath(INVENTORY_PATH);
  redirect(
    `${INVENTORY_PATH}?inventorySuccess=${remainingQuantity === 0 ? "item-consumed-completely" : "item-consumed"}`,
  );
}

export async function consumeInventoryItemAndLogMealAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const consumedQuantity = Number(formData.get("consumed_quantity"));
  const mealType = String(formData.get("meal_type") ?? "").trim();

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=consume-log-not-found`);
  if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
    redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-quantity`);
  }
  if (!isMealType(mealType)) redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-meal-type`);

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "inventory item consumption meal log");

  const { data, error } = await (supabase as any).rpc("consume_inventory_item_and_log_meal", {
    p_item_id: id,
    p_consumed_quantity: consumedQuantity,
    p_meal_type: mealType,
  }) as { data: number | string | null; error: { code?: string; message: string } | null };

  if (error) {
    console.warn("Supabase could not consume the inventory item and log a meal:", error.message);

    if (error.code === "P0002") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-not-found`);
    }

    if (error.code === "22003") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-too-much`);
    }

    if (error.message === "Incomplete inventory nutrition") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-incomplete-nutrition`);
    }

    if (error.message === "Incompatible inventory nutrition unit") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-incompatible-unit`);
    }

    if (error.message === "Invalid meal type") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-meal-type`);
    }

    if (error.message === "Invalid consumed quantity") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-quantity`);
    }

    redirect(`${INVENTORY_PATH}?inventoryError=consume-log-failed`);
  }

  const remainingQuantity = Number(data);

  revalidatePath(INVENTORY_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  redirect(
    `${INVENTORY_PATH}?inventorySuccess=${remainingQuantity === 0 ? "item-consumed-logged-completely" : "item-consumed-logged"}`,
  );
}

export async function deleteInventoryItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=delete-not-found`);

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item deletion");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not delete the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=delete-failed`);
  }

  if (!data?.length) redirect(`${INVENTORY_PATH}?inventoryError=delete-not-found`);

  revalidatePath(INVENTORY_PATH);
  redirect(`${INVENTORY_PATH}?inventorySuccess=item-deleted`);
}
