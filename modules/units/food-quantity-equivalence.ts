import {
  convertFoodQuantity,
  type CanonicalFoodQuantityUnit,
  type FoodQuantityUnit,
} from "@/modules/units/food-quantity";

export const FOOD_QUANTITY_MEASURE_KINDS = [
  "unit",
  "tablespoon",
  "teaspoon",
  "can",
  "package",
  "serving",
] as const;

export const FOOD_QUANTITY_EQUIVALENCE_SOURCES = [
  "user",
  "barcode-memory",
  "observed-package",
  "ai",
] as const;

export type FoodQuantityMeasureKind = (typeof FOOD_QUANTITY_MEASURE_KINDS)[number];
export type FoodQuantityEquivalenceSource = (typeof FOOD_QUANTITY_EQUIVALENCE_SOURCES)[number];
export type FoodQuantityEquivalenceProposalSource = Exclude<FoodQuantityEquivalenceSource, "user">;

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
  source: FoodQuantityEquivalenceProposalSource;
  userConfirmed: false;
}>;

export type FoodQuantityEquivalence =
  | ConfirmedFoodQuantityEquivalence
  | FoodQuantityEquivalenceProposal;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VARIANT_KEY_PATTERN = /^(?=.{1,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_UNITS: readonly CanonicalFoodQuantityUnit[] = ["g", "ml", "ud"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function hasValidLength(value: string, maximum: number): boolean {
  return value.length > 0 && [...value].length <= maximum && value === value.trim();
}

export function toFoodQuantityEquivalence(row: unknown): FoodQuantityEquivalence | null {
  if (!isRecord(row)) return null;

  const id = row.id;
  const foodCatalogItemId = row.food_catalog_item_id;
  const measureKind = row.measure_kind;
  const variantKey = row.variant_key;
  const displayLabel = row.display_label;
  const canonicalQuantity = row.canonical_quantity;
  const canonicalUnit = row.canonical_unit;
  const source = row.source;
  const userConfirmed = row.user_confirmed;
  const updatedAt = row.updated_at;

  if (
    typeof id !== "string" || !UUID_PATTERN.test(id)
    || typeof foodCatalogItemId !== "string" || !UUID_PATTERN.test(foodCatalogItemId)
    || !isMember(FOOD_QUANTITY_MEASURE_KINDS, measureKind)
    || typeof variantKey !== "string" || !VARIANT_KEY_PATTERN.test(variantKey)
    || typeof displayLabel !== "string" || !hasValidLength(displayLabel, 120)
    || typeof canonicalQuantity !== "number" || !Number.isFinite(canonicalQuantity) || canonicalQuantity <= 0
    || !isMember(CANONICAL_UNITS, canonicalUnit)
    || !isMember(FOOD_QUANTITY_EQUIVALENCE_SOURCES, source)
    || typeof userConfirmed !== "boolean"
    || typeof updatedAt !== "string" || updatedAt.length === 0 || !Number.isFinite(Date.parse(updatedAt))
  ) return null;

  const common = {
    id,
    foodCatalogItemId,
    measureKind,
    variantKey,
    displayLabel,
    canonicalQuantity,
    canonicalUnit,
    updatedAt,
  };

  if (source === "user" && userConfirmed) {
    return { ...common, state: "confirmed", source, userConfirmed };
  }
  if (source !== "user" && !userConfirmed) {
    return { ...common, state: "proposed", source, userConfirmed };
  }
  return null;
}

export function convertMeasuredFoodQuantity(
  measureCount: number,
  equivalence: FoodQuantityEquivalence,
  targetUnit?: FoodQuantityUnit,
): { quantity: number; unit: FoodQuantityUnit } | null {
  if (!Number.isFinite(measureCount) || measureCount <= 0) return null;
  const canonicalQuantity = measureCount * equivalence.canonicalQuantity;
  if (!Number.isFinite(canonicalQuantity) || canonicalQuantity <= 0) return null;
  if (targetUnit === undefined) return { quantity: canonicalQuantity, unit: equivalence.canonicalUnit };
  const quantity = convertFoodQuantity(canonicalQuantity, equivalence.canonicalUnit, targetUnit);
  return quantity === null ? null : { quantity, unit: targetUnit };
}

export function selectFoodQuantityEquivalence(
  equivalences: readonly FoodQuantityEquivalence[],
  measureKind: FoodQuantityMeasureKind,
  variantKey?: string,
): FoodQuantityEquivalence | null {
  const matches = equivalences.filter((equivalence) =>
    equivalence.measureKind === measureKind
    && (variantKey === undefined || equivalence.variantKey === variantKey));
  return matches.length === 1 ? matches[0] : null;
}
