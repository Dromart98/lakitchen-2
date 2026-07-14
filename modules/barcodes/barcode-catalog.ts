export const BARCODE_CATALOG_UNITS = ["ud", "g", "kg", "ml", "l"] as const;
export const BARCODE_CATALOG_LOCATIONS = ["pantry", "fridge", "freezer"] as const;

export type BarcodeCatalogUnit = (typeof BARCODE_CATALOG_UNITS)[number];
export type BarcodeCatalogLocation = (typeof BARCODE_CATALOG_LOCATIONS)[number];

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
