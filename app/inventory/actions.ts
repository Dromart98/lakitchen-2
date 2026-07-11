"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type InventoryLocation = "pantry" | "fridge" | "freezer";
type InventoryUnit = "ud" | "g" | "kg" | "ml" | "l";

const inventoryLocations = ["pantry", "fridge", "freezer"] as const;
const inventoryUnits = ["ud", "g", "kg", "ml", "l"] as const;

function isInventoryLocation(value: string): value is InventoryLocation {
  return inventoryLocations.includes(value as InventoryLocation);
}

function isInventoryUnit(value: string): value is InventoryUnit {
  return inventoryUnits.includes(value as InventoryUnit);
}

function getOptionalExpirationDate(formData: FormData) {
  const rawValue = String(formData.get("expires_at") ?? "").trim();

  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || rawValue !== parsedDate.toISOString().slice(0, 10)) {
    redirect("/inventory?inventoryError=invalid-expires-at");
  }

  return rawValue;
}

export async function addInventoryItemAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "");
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");

  if (!name) {
    redirect("/inventory?inventoryError=name-required");
  }

  if (name.length > 120) {
    redirect("/inventory?inventoryError=name-too-long");
  }

  if (!isInventoryLocation(location)) {
    redirect("/inventory?inventoryError=invalid-location");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect("/inventory?inventoryError=invalid-quantity");
  }

  if (!isInventoryUnit(unit)) {
    redirect("/inventory?inventoryError=invalid-unit");
  }

  const expiresAt = getOptionalExpirationDate(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item creation");

  const { error } = await (supabase as any).from("inventory_items").insert({
    user_id: user.id,
    name,
    location,
    quantity,
    unit,
    expires_at: expiresAt,
  });

  if (error) {
    console.warn("Supabase could not save the inventory item:", error.message);
    redirect("/inventory?inventoryError=save-failed");
  }

  revalidatePath("/inventory");
  redirect("/inventory?inventorySuccess=item-created");
}
