"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  deriveFoodQuantityVariantKey,
  isValidEquivalenceId,
  isValidUpdatedAt,
  isValidVariantKey,
  validateEquivalenceFields,
} from "@/modules/units/food-quantity-equivalence-management";

const PATH = "/inventory/equivalences";
type ErrorCode = "validation" | "food-unavailable" | "conflict" | "duplicate" | "save-failed" | "delete-failed";

function fail(code: ErrorCode): never { redirect(`${PATH}?equivalenceError=${code}`); }
function succeeded(code: "created" | "reviewed" | "deleted"): never {
  revalidatePath(PATH);
  redirect(`${PATH}?equivalenceSuccess=${code}`);
}
function rpcErrorCode(error: { message?: string; code?: string } | null, fallback: "save-failed" | "delete-failed"): ErrorCode {
  if (error?.message?.includes("equivalence_conflict") || error?.code === "40001") return "conflict";
  if (error?.message?.includes("food-catalog-item-not-owned") || error?.code === "42501") return "food-unavailable";
  if (error?.code === "23505") return "duplicate";
  return fallback;
}

async function authenticatedContext(reason: string) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, reason);
  return { supabase, user };
}

async function ownsFoodIdentity(supabase: any, userId: string, foodId: string): Promise<boolean> {
  const { data, error } = await supabase.from("food_catalog_items").select("id").eq("id", foodId).eq("user_id", userId).maybeSingle();
  if (error) console.warn("Could not validate food identity ownership:", error.message);
  return !error && Boolean(data);
}

export async function createFoodQuantityEquivalenceAction(formData: FormData) {
  const fields = validateEquivalenceFields(formData);
  if (!fields) fail("validation");
  const variantKey = deriveFoodQuantityVariantKey(fields.displayLabel);
  if (!variantKey) fail("validation");
  const { supabase, user } = await authenticatedContext("food quantity equivalence creation");
  if (!await ownsFoodIdentity(supabase, user.id, fields.foodCatalogItemId)) fail("food-unavailable");
  const { error } = await (supabase as any).rpc("save_confirmed_food_quantity_equivalence", {
    p_equivalence_id: null, p_food_catalog_item_id: fields.foodCatalogItemId,
    p_measure_kind: fields.measureKind, p_variant_key: variantKey, p_display_label: fields.displayLabel,
    p_canonical_quantity: fields.canonicalQuantity, p_canonical_unit: fields.canonicalUnit, p_expected_updated_at: null,
  });
  if (error) {
    console.warn("Could not create food quantity equivalence:", error.message);
    const code = rpcErrorCode(error, "save-failed");
    fail(code === "conflict" ? "duplicate" : code);
  }
  succeeded("created");
}

export async function updateFoodQuantityEquivalenceAction(formData: FormData) {
  const fields = validateEquivalenceFields(formData);
  const id = String(formData.get("id") ?? "").trim();
  const variantKey = String(formData.get("variant_key") ?? "").trim();
  const updatedAt = String(formData.get("updated_at") ?? "").trim();
  if (!fields || !isValidEquivalenceId(id) || !isValidVariantKey(variantKey) || !isValidUpdatedAt(updatedAt)) fail("validation");
  const { supabase, user } = await authenticatedContext("food quantity equivalence update");
  if (!await ownsFoodIdentity(supabase, user.id, fields.foodCatalogItemId)) fail("food-unavailable");
  const { error } = await (supabase as any).rpc("save_confirmed_food_quantity_equivalence", {
    p_equivalence_id: id, p_food_catalog_item_id: fields.foodCatalogItemId,
    p_measure_kind: fields.measureKind, p_variant_key: variantKey, p_display_label: fields.displayLabel,
    p_canonical_quantity: fields.canonicalQuantity, p_canonical_unit: fields.canonicalUnit, p_expected_updated_at: updatedAt,
  });
  if (error) { console.warn("Could not update food quantity equivalence:", error.message); fail(rpcErrorCode(error, "save-failed")); }
  succeeded("reviewed");
}

export async function deleteFoodQuantityEquivalenceAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const updatedAt = String(formData.get("updated_at") ?? "").trim();
  if (!isValidEquivalenceId(id) || !isValidUpdatedAt(updatedAt)) fail("validation");
  const { supabase } = await authenticatedContext("food quantity equivalence deletion");
  const { error } = await (supabase as any).rpc("delete_food_quantity_equivalence", { p_equivalence_id: id, p_expected_updated_at: updatedAt });
  if (error) { console.warn("Could not delete food quantity equivalence:", error.message); fail(rpcErrorCode(error, "delete-failed")); }
  succeeded("deleted");
}
