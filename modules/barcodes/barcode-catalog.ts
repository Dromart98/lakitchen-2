import { isInventoryCategory, type InventoryCategory } from "@/modules/inventory/inventory-categories";
import {
  hasInventoryNutritionValues,
  isInventoryNutritionBasis,
  parseOptionalInventoryNutritionNumber,
  type InventoryNutritionBasis,
} from "@/modules/inventory/inventory-nutrition";

export const BARCODE_CATALOG_UNITS = ["ud", "g", "kg", "ml", "l"] as const;
export const BARCODE_CATALOG_LOCATIONS = ["pantry", "fridge", "freezer"] as const;

export type BarcodeCatalogUnit = (typeof BARCODE_CATALOG_UNITS)[number];
export type BarcodeCatalogLocation = (typeof BARCODE_CATALOG_LOCATIONS)[number];

export type BarcodeCatalogNutritionFields = {
  nutritionBasis: InventoryNutritionBasis | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type BarcodeCatalogValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "invalid" };

export function validateAndNormalizeBarcodeProductName(value: FormDataEntryValue | null): BarcodeCatalogValidationResult<string> {
  const name = String(value ?? "").trim();

  if (!name || name.length > 120) return { ok: false, code: "invalid" };

  return { ok: true, value: name };
}

export function validateBarcodeProductQuantity(value: FormDataEntryValue | null): BarcodeCatalogValidationResult<number> {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, code: "invalid" };

  return { ok: true, value: quantity };
}

export function validateBarcodeProductUnit(value: FormDataEntryValue | null): BarcodeCatalogValidationResult<BarcodeCatalogUnit> {
  const unit = String(value ?? "").trim();

  if (!BARCODE_CATALOG_UNITS.some((allowedUnit) => allowedUnit === unit)) return { ok: false, code: "invalid" };

  return { ok: true, value: unit as BarcodeCatalogUnit };
}

export function normalizeBarcodeProductLocation(
  value: FormDataEntryValue | null,
): BarcodeCatalogValidationResult<BarcodeCatalogLocation | null> {
  const location = String(value ?? "").trim();

  if (!location) return { ok: true, value: null };
  if (!BARCODE_CATALOG_LOCATIONS.some((allowedLocation) => allowedLocation === location)) return { ok: false, code: "invalid" };

  return { ok: true, value: location as BarcodeCatalogLocation };
}

export function validateBarcodeProductCategory(value: FormDataEntryValue | null): BarcodeCatalogValidationResult<InventoryCategory> {
  const category = String(value ?? "").trim();

  if (!isInventoryCategory(category)) return { ok: false, code: "invalid" };

  return { ok: true, value: category };
}

export function validateBarcodeProductNutritionBasis(
  value: FormDataEntryValue | null,
): BarcodeCatalogValidationResult<InventoryNutritionBasis | null> {
  const nutritionBasis = String(value ?? "").trim();

  if (!nutritionBasis) return { ok: true, value: null };
  if (!isInventoryNutritionBasis(nutritionBasis)) return { ok: false, code: "invalid" };

  return { ok: true, value: nutritionBasis };
}

export function validateBarcodeProductNutritionNumber(value: FormDataEntryValue | null): BarcodeCatalogValidationResult<number | null> {
  const nutritionValue = parseOptionalInventoryNutritionNumber(value);

  if (nutritionValue !== null && (!Number.isFinite(nutritionValue) || nutritionValue < 0)) return { ok: false, code: "invalid" };

  return { ok: true, value: nutritionValue };
}

export function validateBarcodeProductNutritionFields(input: {
  nutrition_basis: FormDataEntryValue | null;
  calories: FormDataEntryValue | null;
  protein_g: FormDataEntryValue | null;
  carbs_g: FormDataEntryValue | null;
  fat_g: FormDataEntryValue | null;
}): BarcodeCatalogValidationResult<BarcodeCatalogNutritionFields> {
  const nutritionBasis = validateBarcodeProductNutritionBasis(input.nutrition_basis);
  const calories = validateBarcodeProductNutritionNumber(input.calories);
  const proteinG = validateBarcodeProductNutritionNumber(input.protein_g);
  const carbsG = validateBarcodeProductNutritionNumber(input.carbs_g);
  const fatG = validateBarcodeProductNutritionNumber(input.fat_g);

  if (!nutritionBasis.ok || !calories.ok || !proteinG.ok || !carbsG.ok || !fatG.ok) return { ok: false, code: "invalid" };

  const nutritionValues = [calories.value, proteinG.value, carbsG.value, fatG.value];

  if (!nutritionBasis.value && hasInventoryNutritionValues(nutritionValues)) return { ok: false, code: "invalid" };

  return {
    ok: true,
    value: {
      nutritionBasis: nutritionBasis.value,
      calories: calories.value,
      proteinG: proteinG.value,
      carbsG: carbsG.value,
      fatG: fatG.value,
    },
  };
}
