"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const validLocations = ["pantry", "fridge", "freezer"] as const;
const validUnits = ["ud", "g", "kg", "ml", "l"] as const;

type InventoryLocation = (typeof validLocations)[number];
type InventoryUnit = (typeof validUnits)[number];
type InventoryErrorCode =
  | "name-required"
  | "name-too-long"
  | "invalid-location"
  | "invalid-quantity"
  | "invalid-unit"
  | "invalid-expiration"
  | "save-failed";

function redirectWithError(code: InventoryErrorCode): never {
  redirect(`/inventory?inventoryError=${code}`);
}

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseLocation(value: string): InventoryLocation | null {
  return validLocations.includes(value as InventoryLocation) ? (value as InventoryLocation) : null;
}

function parseUnit(value: string): InventoryUnit | null {
  return validUnits.includes(value as InventoryUnit) ? (value as InventoryUnit) : null;
}

function parseQuantity(value: string): number | null {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function parseExpirationDate(value: string): string | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString().slice(0, 10) === value ? value : undefined;
}

export async function addInventoryItemAction(formData: FormData) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item creation");

  const name = getFormValue(formData, "name");
  if (!name) redirectWithError("name-required");
  if (name.length > 120) redirectWithError("name-too-long");

  const location = parseLocation(getFormValue(formData, "location"));
  if (!location) redirectWithError("invalid-location");

  const quantity = parseQuantity(getFormValue(formData, "quantity"));
  if (quantity === null) redirectWithError("invalid-quantity");

  const unit = parseUnit(getFormValue(formData, "unit"));
  if (!unit) redirectWithError("invalid-unit");

  const expiresAt = parseExpirationDate(getFormValue(formData, "expires_at"));
  if (expiresAt === undefined) redirectWithError("invalid-expiration");

  const { error } = await (supabase as any)
    .from("inventory_items")
    .insert({
      user_id: user.id,
      name,
      location,
      quantity,
      unit,
      expires_at: expiresAt,
    });

  if (error) {
    console.warn("Supabase could not save inventory item:", error.message);
    redirectWithError("save-failed");
  }

  revalidatePath("/inventory");
  redirect("/inventory?inventorySuccess=created");
}
