import {
  toFoodQuantityEquivalence,
  type ConfirmedFoodQuantityEquivalence,
} from "@/modules/units/food-quantity-equivalence";

export type InventoryConfirmedUnitMeasure = Readonly<{
  canonicalQuantity: number;
  canonicalUnit: "g" | "ml";
}>;

type EquivalenceRow = Record<string, unknown>;

export function selectInventoryUnitMeasures(
  rows: readonly unknown[],
  userId: string,
  foodCatalogItemIds: readonly string[],
): ReadonlyMap<string, InventoryConfirmedUnitMeasure> {
  const allowedIdentities = new Set(foodCatalogItemIds.filter(Boolean));
  const grouped = new Map<string, ConfirmedFoodQuantityEquivalence[]>();

  for (const value of rows) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const row = value as EquivalenceRow;
    if (row.user_id !== userId || !allowedIdentities.has(String(row.food_catalog_item_id ?? ""))) continue;

    const equivalence = toFoodQuantityEquivalence(row);
    if (
      !equivalence
      || equivalence.state !== "confirmed"
      || equivalence.measureKind !== "unit"
      || (equivalence.canonicalUnit !== "g" && equivalence.canonicalUnit !== "ml")
    ) continue;

    const matches = grouped.get(equivalence.foodCatalogItemId) ?? [];
    matches.push(equivalence);
    grouped.set(equivalence.foodCatalogItemId, matches);
  }

  const selected = new Map<string, InventoryConfirmedUnitMeasure>();
  for (const [foodCatalogItemId, matches] of grouped) {
    if (matches.length !== 1) continue;
    selected.set(foodCatalogItemId, {
      canonicalQuantity: matches[0].canonicalQuantity,
      canonicalUnit: matches[0].canonicalUnit as "g" | "ml",
    });
  }
  return selected;
}
