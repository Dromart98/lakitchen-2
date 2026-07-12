"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

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

function getValidatedInventoryFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "");
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");

  if (!name) redirect(`${INVENTORY_PATH}?inventoryError=name-required`);
  if (name.length > 120) redirect(`${INVENTORY_PATH}?inventoryError=name-too-long`);
  if (!Number.isFinite(quantity) || quantity <= 0) redirect(`${INVENTORY_PATH}?inventoryError=invalid-quantity`);
  if (!isInventoryUnit(unit)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-unit`);
  if (!isInventoryLocation(location)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-location`);

  return { name, quantity, unit, location, expiresAt: getOptionalExpirationDate(formData) };
}

export async function addInventoryItemAction(formData: FormData) {
  const { name, quantity, unit, location, expiresAt } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item creation");

  const { error } = await (supabase as any).from("inventory_items").insert({
    user_id: user.id,
    name,
    quantity,
    unit,
    location,
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

  const { name, quantity, unit, location, expiresAt } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item update");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .update({ name, quantity, unit, location, expires_at: expiresAt })
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
