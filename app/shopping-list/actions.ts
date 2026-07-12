"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ShoppingListUnit = "ud" | "g" | "kg" | "ml" | "l";
type InventoryLocation = "pantry" | "fridge" | "freezer";

const inventoryLocations = ["pantry", "fridge", "freezer"] as const;
const shoppingListUnits = ["ud", "g", "kg", "ml", "l"] as const;

function isInventoryLocation(value: string): value is InventoryLocation {
  return inventoryLocations.includes(value as InventoryLocation);
}

function isShoppingListUnit(value: string): value is ShoppingListUnit {
  return shoppingListUnits.includes(value as ShoppingListUnit);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOptionalExpirationDate(formData: FormData) {
  const rawValue = String(formData.get("expires_at") ?? "").trim();

  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || rawValue !== parsedDate.toISOString().slice(0, 10)) {
    redirect("/shopping-list?shoppingListError=invalid-expires-at");
  }

  return rawValue;
}

function getValidatedShoppingListFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");

  if (!name) {
    redirect("/shopping-list?shoppingListError=name-required");
  }

  if (name.length > 120) {
    redirect("/shopping-list?shoppingListError=name-too-long");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect("/shopping-list?shoppingListError=invalid-quantity");
  }

  if (!isShoppingListUnit(unit)) {
    redirect("/shopping-list?shoppingListError=invalid-unit");
  }

  return { name, quantity, unit };
}

export async function addShoppingListItemAction(formData: FormData) {
  const { name, quantity, unit } = getValidatedShoppingListFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item creation");

  const { error } = await (supabase as any).from("shopping_list_items").insert({
    user_id: user.id,
    name,
    quantity,
    unit,
  });

  if (error) {
    console.warn("Supabase could not save the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=save-failed");
  }

  revalidatePath("/shopping-list");
  redirect("/shopping-list?shoppingListSuccess=item-created");
}

export async function updateShoppingListItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  const { name, quantity, unit } = getValidatedShoppingListFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item update");

  const { data, error } = await (supabase as any)
    .from("shopping_list_items")
    .update({
      name,
      quantity,
      unit,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not update the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=update-failed");
  }

  if (!data?.length) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  revalidatePath("/shopping-list");
  redirect("/shopping-list?shoppingListSuccess=item-updated");
}

export async function setShoppingListItemPurchasedAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const rawIsPurchased = String(formData.get("is_purchased") ?? "");

  if (!isUuid(id) || (rawIsPurchased !== "true" && rawIsPurchased !== "false")) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  const isPurchased = rawIsPurchased === "true";
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item purchase state update");

  const { data, error } = await (supabase as any)
    .from("shopping_list_items")
    .update({ is_purchased: isPurchased })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not update the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=update-failed");
  }

  if (!data?.length) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  revalidatePath("/shopping-list");
  redirect(`/shopping-list?shoppingListSuccess=${isPurchased ? "item-purchased" : "item-pending"}`);
}

export async function transferShoppingListItemToInventoryAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const location = String(formData.get("location") ?? "");

  if (!isUuid(id)) {
    redirect("/shopping-list?shoppingListError=transfer-not-available");
  }

  if (!isInventoryLocation(location)) {
    redirect("/shopping-list?shoppingListError=invalid-location");
  }

  const expiresAt = getOptionalExpirationDate(formData);
  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "shopping list item transfer to inventory");

  const { error } = await (supabase as any).rpc("transfer_purchased_shopping_item_to_inventory", {
    p_item_id: id,
    p_location: location,
    p_expires_at: expiresAt,
  }) as {
    data: string | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    if (error.code === "P0002") {
      redirect("/shopping-list?shoppingListError=transfer-not-available");
    }

    console.warn("Supabase could not transfer the shopping list item to inventory:", error.message);
    redirect("/shopping-list?shoppingListError=transfer-failed");
  }

  revalidatePath("/shopping-list");
  revalidatePath("/inventory");
  redirect("/shopping-list?shoppingListSuccess=item-transferred");
}

export async function deleteShoppingListItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item deletion");

  const { data, error } = await (supabase as any)
    .from("shopping_list_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not delete the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=delete-failed");
  }

  if (!data?.length) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  revalidatePath("/shopping-list");
  redirect("/shopping-list?shoppingListSuccess=item-deleted");
}
