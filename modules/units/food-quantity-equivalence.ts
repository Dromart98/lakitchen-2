import {
  convertFoodQuantity,
  type CanonicalFoodQuantityUnit,
  type FoodQuantityUnit,
} from "./food-quantity";

export const FOOD_QUANTITY_MEASURE_KINDS = [
  "unit", "tablespoon", "teaspoon", "can", "package", "serving",
] as const;
export type FoodQuantityMeasureKind = (typeof FOOD_QUANTITY_MEASURE_KINDS)[number];

export const FOOD_QUANTITY_EQUIVALENCE_SOURCES = [
  "user", "barcode-memory", "observed-package", "ai",
] as const;
export type FoodQuantityEquivalenceSource = (typeof FOOD_QUANTITY_EQUIVALENCE_SOURCES)[number];

type FoodQuantityEquivalenceBase = Readonly<{
  id: string;
  foodCatalogItemId: string;
  measureKind: FoodQuantityMeasureKind;
  variantKey: string;
  displayLabel: string;
  canonicalQuantity: number;
  canonicalUnit: CanonicalFoodQuantityUnit;
  updatedAt: string;
}>;

export type ConfirmedFoodQuantityEquivalence = FoodQuantityEquivalenceBase & Readonly<{
  state: "confirmed";
  source: "user";
  userConfirmed: true;
}>;

export type FoodQuantityEquivalenceProposal = FoodQuantityEquivalenceBase & Readonly<{
  state: "proposed";
  source: Exclude<FoodQuantityEquivalenceSource, "user">;
  userConfirmed: false;
}>;

export type FoodQuantityEquivalence =
  | ConfirmedFoodQuantityEquivalence
  | FoodQuantityEquivalenceProposal;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VARIANT_KEY_PATTERN = /^(?=.{1,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_UNITS = new Set<CanonicalFoodQuantityUnit>(["g", "ml", "ud"]);
const MEASURE_KINDS = new Set<string>(FOOD_QUANTITY_MEASURE_KINDS);
const SOURCES = new Set<string>(FOOD_QUANTITY_EQUIVALENCE_SOURCES);

export function toFoodQuantityEquivalence(row: unknown): FoodQuantityEquivalence | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const {
    id, food_catalog_item_id: foodCatalogItemId, measure_kind: measureKind,
    variant_key: variantKey, display_label: displayLabel,
    canonical_quantity: canonicalQuantity, canonical_unit: canonicalUnit,
    source, user_confirmed: userConfirmed, updated_at: updatedAt,
  } = value;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)
    || typeof foodCatalogItemId !== "string" || !UUID_PATTERN.test(foodCatalogItemId)
    || typeof measureKind !== "string" || !MEASURE_KINDS.has(measureKind)
    || typeof variantKey !== "string" || !VARIANT_KEY_PATTERN.test(variantKey)
    || typeof displayLabel !== "string" || displayLabel !== displayLabel.trim()
    || displayLabel.length < 1 || displayLabel.length > 120
    || typeof canonicalQuantity !== "number" || !Number.isFinite(canonicalQuantity) || canonicalQuantity <= 0
    || typeof canonicalUnit !== "string" || !CANONICAL_UNITS.has(canonicalUnit as CanonicalFoodQuantityUnit)
    || typeof source !== "string" || !SOURCES.has(source)
    || typeof userConfirmed !== "boolean"
    || typeof updatedAt !== "string" || updatedAt.trim() !== updatedAt
    || updatedAt.length === 0 || !Number.isFinite(Date.parse(updatedAt))
    || (source === "user") !== userConfirmed) return null;

  const base = {
    id, foodCatalogItemId, measureKind: measureKind as FoodQuantityMeasureKind,
    variantKey, displayLabel, canonicalQuantity,
    canonicalUnit: canonicalUnit as CanonicalFoodQuantityUnit, updatedAt,
  };
  return source === "user"
    ? { ...base, state: "confirmed", source, userConfirmed: true }
    : { ...base, state: "proposed", source: source as FoodQuantityEquivalenceProposal["source"], userConfirmed: false };
}

export function convertMeasuredFoodQuantity(
  measureCount: number,
  equivalence: FoodQuantityEquivalence,
  targetUnit?: FoodQuantityUnit,
): { quantity: number; unit: FoodQuantityUnit } | null {
  if (!Number.isFinite(measureCount) || measureCount <= 0) return null;
  const quantity = measureCount * equivalence.canonicalQuantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (targetUnit === undefined) return { quantity, unit: equivalence.canonicalUnit };
  const converted = convertFoodQuantity(quantity, equivalence.canonicalUnit, targetUnit);
  return converted === null ? null : { quantity: converted, unit: targetUnit };
}

export function selectFoodQuantityEquivalence(
  equivalences: readonly FoodQuantityEquivalence[],
  measureKind: FoodQuantityMeasureKind,
  variantKey?: string,
): FoodQuantityEquivalence | null {
  const matches = equivalences.filter((item) => item.measureKind === measureKind
    && (variantKey === undefined || item.variantKey === variantKey));
  return matches.length === 1 ? matches[0] : null;
}
