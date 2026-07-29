import {
  FOOD_QUANTITY_CANONICAL_UNITS,
  FOOD_QUANTITY_MEASURE_KINDS,
  deriveFoodQuantityVariantKey,
  type FoodQuantityMeasureKind,
} from "@/modules/units/food-quantity-equivalence";

export type FoodIdentityOption = Readonly<{ id: string; displayName: string }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VARIANT_KEY_PATTERN = /^(?=.{1,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function mergeCandidateFoodIdentityIds(
  inventoryRows: readonly { food_catalog_item_id: unknown }[],
  equivalenceFoodIds: readonly string[],
): string[] {
  const ids = new Set(equivalenceFoodIds.filter((id) => UUID_PATTERN.test(id)));
  for (const row of inventoryRows) {
    if (typeof row.food_catalog_item_id === "string" && UUID_PATTERN.test(row.food_catalog_item_id)) {
      ids.add(row.food_catalog_item_id);
    }
  }
  return [...ids];
}

export function toFoodIdentityOption(row: unknown): FoodIdentityOption | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const displayName = typeof value.display_name === "string" ? value.display_name.trim() : "";
  return typeof value.id === "string" && UUID_PATTERN.test(value.id) && displayName.length > 0 && [...displayName].length <= 120
    ? { id: value.id, displayName }
    : null;
}

export type ValidatedEquivalenceFields = Readonly<{
  foodCatalogItemId: string;
  measureKind: FoodQuantityMeasureKind;
  displayLabel: string;
  canonicalQuantity: number;
  canonicalUnit: "g" | "ml" | "ud";
}>;

export function validateEquivalenceFields(formData: FormData): ValidatedEquivalenceFields | null {
  const foodCatalogItemId = String(formData.get("food_catalog_item_id") ?? "").trim();
  const measureKind = String(formData.get("measure_kind") ?? "").trim();
  const displayLabel = String(formData.get("display_label") ?? "").trim();
  const quantityText = String(formData.get("canonical_quantity") ?? "").trim();
  const canonicalQuantity = Number(quantityText);
  const canonicalUnit = String(formData.get("canonical_unit") ?? "").trim();
  if (
    !UUID_PATTERN.test(foodCatalogItemId)
    || !FOOD_QUANTITY_MEASURE_KINDS.includes(measureKind as FoodQuantityMeasureKind)
    || displayLabel.length === 0
    || [...displayLabel].length > 120
    || quantityText.length === 0
    || !Number.isFinite(canonicalQuantity)
    || canonicalQuantity <= 0
    || !FOOD_QUANTITY_CANONICAL_UNITS.includes(canonicalUnit as "g" | "ml" | "ud")
  ) return null;
  return { foodCatalogItemId, measureKind: measureKind as FoodQuantityMeasureKind, displayLabel, canonicalQuantity, canonicalUnit: canonicalUnit as "g" | "ml" | "ud" };
}

export function isValidEquivalenceId(value: string): boolean { return UUID_PATTERN.test(value); }
export function isValidVariantKey(value: string): boolean { return VARIANT_KEY_PATTERN.test(value); }
export function isValidUpdatedAt(value: string): boolean { return value.length > 0 && Number.isFinite(Date.parse(value)); }
export { deriveFoodQuantityVariantKey };
