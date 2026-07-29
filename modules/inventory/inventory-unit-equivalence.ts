import {
  toFoodQuantityEquivalence,
} from "@/modules/units/food-quantity-equivalence";

export type InventoryConfirmedUnitMeasure = Readonly<{
  id: string;
  updatedAt: string;
  canonicalQuantity: number;
  canonicalUnit: "g" | "ml";
}>;

export type InventoryUnitMeasureValue = Readonly<{
  canonicalQuantity: number;
  canonicalUnit: "g" | "ml";
}>;

export function toInventoryUnitMeasureValue(
  measure: InventoryConfirmedUnitMeasure,
): InventoryUnitMeasureValue {
  return {
    canonicalQuantity: measure.canonicalQuantity,
    canonicalUnit: measure.canonicalUnit,
  };
}

type EquivalenceRow = Record<string, unknown>;

export function selectInventoryUnitMeasures(
  rows: readonly unknown[],
  userId: string,
  foodCatalogItemIds: readonly string[],
): ReadonlyMap<string, InventoryConfirmedUnitMeasure> {
  const allowedIdentities = new Set(foodCatalogItemIds.filter(Boolean));
  const grouped = new Map<string, EquivalenceRow[]>();

  for (const value of rows) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const row = value as EquivalenceRow;
    if (row.user_id !== userId || !allowedIdentities.has(String(row.food_catalog_item_id ?? ""))) continue;

    if (
      row.measure_kind !== "unit"
      || row.user_confirmed !== true
      || row.source !== "user"
    ) continue;

    const foodCatalogItemId = String(row.food_catalog_item_id);
    const matches = grouped.get(foodCatalogItemId) ?? [];
    matches.push(row);
    grouped.set(foodCatalogItemId, matches);
  }

  const selected = new Map<string, InventoryConfirmedUnitMeasure>();
  for (const [foodCatalogItemId, matches] of grouped) {
    if (matches.length !== 1) continue;
    const equivalence = toFoodQuantityEquivalence(matches[0]);
    if (
      !equivalence
      || equivalence.state !== "confirmed"
      || equivalence.measureKind !== "unit"
      || (equivalence.canonicalUnit !== "g" && equivalence.canonicalUnit !== "ml")
    ) continue;
    selected.set(foodCatalogItemId, {
      id: equivalence.id,
      updatedAt: equivalence.updatedAt,
      canonicalQuantity: equivalence.canonicalQuantity,
      canonicalUnit: equivalence.canonicalUnit,
    });
  }
  return selected;
}
