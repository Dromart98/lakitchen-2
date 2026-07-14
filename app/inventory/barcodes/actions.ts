"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeBarcodeProductLocation,
  validateAndNormalizeBarcodeProductName,
  validateBarcodeProductCategory,
  validateBarcodeProductNutritionFields,
  validateBarcodeProductQuantity,
  validateBarcodeProductUnit,
} from "@/modules/barcodes/barcode-catalog";

const BARCODE_CATALOG_PATH = "/inventory/barcodes";

type SupabaseMutationResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

type SupabaseBarcodeCatalogClient = {
  from(table: "user_barcode_products"): {
    update(values: {
      name: string;
      default_quantity: number;
      default_unit: string;
      default_location: string | null;
      default_category: string;
      nutrition_basis: string | null;
      calories: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
    }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: "id"): {
            maybeSingle(): Promise<SupabaseMutationResult>;
          };
        };
      };
    };
    delete(): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: "id"): {
            maybeSingle(): Promise<SupabaseMutationResult>;
          };
        };
      };
    };
  };
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function redirectToError(code: "validation" | "not-found" | "update-failed" | "delete-failed"): never {
  const errorCodeByResult = {
    validation: "validation",
    "not-found": "not-found",
    "update-failed": "update-failed",
    "delete-failed": "delete-failed",
  } as const;

  redirect(`${BARCODE_CATALOG_PATH}?barcodeCatalogError=${errorCodeByResult[code]}`);
}

function getValidatedBarcodeProductFields(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const name = validateAndNormalizeBarcodeProductName(formData.get("name"));
  const quantity = validateBarcodeProductQuantity(formData.get("default_quantity"));
  const unit = validateBarcodeProductUnit(formData.get("default_unit"));
  const location = normalizeBarcodeProductLocation(formData.get("default_location"));
  const category = validateBarcodeProductCategory(formData.get("default_category"));
  const nutrition = validateBarcodeProductNutritionFields({
    nutrition_basis: formData.get("nutrition_basis"),
    calories: formData.get("calories"),
    protein_g: formData.get("protein_g"),
    carbs_g: formData.get("carbs_g"),
    fat_g: formData.get("fat_g"),
  });

  if (!isUuid(id) || !name.ok || !quantity.ok || !unit.ok || !location.ok || !category.ok || !nutrition.ok) {
    redirectToError("validation");
  }

  return {
    id,
    name: name.value,
    defaultQuantity: quantity.value,
    defaultUnit: unit.value,
    defaultLocation: location.value,
    defaultCategory: category.value,
    nutritionBasis: nutrition.value.nutritionBasis,
    calories: nutrition.value.calories,
    proteinG: nutrition.value.proteinG,
    carbsG: nutrition.value.carbsG,
    fatG: nutrition.value.fatG,
  };
}

export async function updateRememberedBarcodeProductAction(formData: FormData) {
  const { id, name, defaultQuantity, defaultUnit, defaultLocation, defaultCategory, nutritionBasis, calories, proteinG, carbsG, fatG } = getValidatedBarcodeProductFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "remembered barcode product update");

  const { data, error } = await (supabase as unknown as SupabaseBarcodeCatalogClient)
    .from("user_barcode_products")
    .update({
      name,
      default_quantity: defaultQuantity,
      default_unit: defaultUnit,
      default_location: defaultLocation,
      default_category: defaultCategory,
      nutrition_basis: nutritionBasis,
      calories,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("Supabase could not update the remembered barcode product:", error.message);
    redirectToError("update-failed");
  }

  if (!data) redirectToError("not-found");

  revalidatePath(BARCODE_CATALOG_PATH);
  redirect(`${BARCODE_CATALOG_PATH}?barcodeCatalogSuccess=updated`);
}

export async function deleteRememberedBarcodeProductAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) redirectToError("validation");

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "remembered barcode product deletion");

  const { data, error } = await (supabase as unknown as SupabaseBarcodeCatalogClient)
    .from("user_barcode_products")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("Supabase could not delete the remembered barcode product:", error.message);
    redirectToError("delete-failed");
  }

  if (!data) redirectToError("not-found");

  revalidatePath(BARCODE_CATALOG_PATH);
  redirect(`${BARCODE_CATALOG_PATH}?barcodeCatalogSuccess=deleted`);
}
