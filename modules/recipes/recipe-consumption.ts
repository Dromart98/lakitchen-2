import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";
import { RECIPE_MAX_INGREDIENTS } from "@/modules/recipes/recipe-limits";
import { convertFoodQuantity } from "@/modules/units/food-quantity";

export type RecipeConsumptionLine = {
  item_id: string;
  consumed_quantity: number;
};

export type RecipeConsumptionInventoryItem = {
  id: string;
  unit: string;
};

export type RecipeConsumptionResult =
  | { ok: true; lines: RecipeConsumptionLine[] }
  | {
      ok: false;
      code:
        | "empty"
        | "missing-item"
        | "invalid-quantity"
        | "incompatible-unit"
        | "too-many-items";
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BaseUnit = RecipeIngredientAllocation["usedUnit"];

function isValidItemId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isPositiveFiniteQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function convertBaseQuantityToInventoryUnit(quantity: number, baseUnit: BaseUnit, inventoryUnit: string): number | null {
  return convertFoodQuantity(quantity, baseUnit, inventoryUnit);
}

export function buildRecipeConsumptionLines(
  allocations: RecipeIngredientAllocation[],
  inventoryItems: RecipeConsumptionInventoryItem[],
): RecipeConsumptionResult {
  if (allocations.length === 0) return { ok: false, code: "empty" };

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const quantitiesByItemId = new Map<string, number>();

  for (const allocation of allocations) {
    const itemId = allocation.inventoryItemId.trim();

    if (!isValidItemId(itemId)) return { ok: false, code: "missing-item" };

    const item = inventoryById.get(itemId);
    if (!item) return { ok: false, code: "missing-item" };

    if (!isPositiveFiniteQuantity(allocation.usedQuantity)) {
      return { ok: false, code: "invalid-quantity" };
    }

    if (allocation.originalUnit !== undefined && allocation.originalUnit !== item.unit) {
      return { ok: false, code: "incompatible-unit" };
    }
    const convertedQuantity = allocation.usedConfirmedUnitMeasure
      ? allocation.originalQuantity ?? null
      : convertBaseQuantityToInventoryUnit(allocation.usedQuantity, allocation.usedUnit, item.unit);
    if (convertedQuantity === null) return { ok: false, code: "incompatible-unit" };
    if (!isPositiveFiniteQuantity(convertedQuantity)) return { ok: false, code: "invalid-quantity" };

    const summedQuantity = (quantitiesByItemId.get(itemId) ?? 0) + convertedQuantity;
    if (!isPositiveFiniteQuantity(summedQuantity)) return { ok: false, code: "invalid-quantity" };

    quantitiesByItemId.set(itemId, summedQuantity);

    if (quantitiesByItemId.size > RECIPE_MAX_INGREDIENTS) return { ok: false, code: "too-many-items" };
  }

  const lines = [...quantitiesByItemId]
    .sort(([firstItemId], [secondItemId]) => firstItemId.localeCompare(secondItemId))
    .map(([item_id, consumed_quantity]) => ({ item_id, consumed_quantity }));

  if (lines.length === 0) return { ok: false, code: "empty" };

  return { ok: true, lines };
}
