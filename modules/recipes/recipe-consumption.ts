import type { RecipeIngredientAllocation } from "@/modules/recipes/recipe-matching";

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

const MAX_UNIQUE_ITEMS = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type BaseUnit = RecipeIngredientAllocation["usedUnit"];

function isValidItemId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function convertBaseQuantityToInventoryUnit(quantity: number, baseUnit: BaseUnit, inventoryUnit: string): number | null {
  if (baseUnit === "g") {
    if (inventoryUnit === "g") return quantity;
    if (inventoryUnit === "kg") return quantity / 1000;
    return null;
  }

  if (baseUnit === "ml") {
    if (inventoryUnit === "ml") return quantity;
    if (inventoryUnit === "l") return quantity / 1000;
    return null;
  }

  if (baseUnit === "ud") {
    return inventoryUnit === "ud" ? quantity : null;
  }

  return null;
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

    if (!Number.isFinite(allocation.usedQuantity) || allocation.usedQuantity <= 0) {
      return { ok: false, code: "invalid-quantity" };
    }

    const convertedQuantity = convertBaseQuantityToInventoryUnit(allocation.usedQuantity, allocation.usedUnit, item.unit);
    if (convertedQuantity === null) return { ok: false, code: "incompatible-unit" };

    quantitiesByItemId.set(itemId, (quantitiesByItemId.get(itemId) ?? 0) + convertedQuantity);

    if (quantitiesByItemId.size > MAX_UNIQUE_ITEMS) return { ok: false, code: "too-many-items" };
  }

  const lines = [...quantitiesByItemId]
    .sort(([firstItemId], [secondItemId]) => firstItemId.localeCompare(secondItemId))
    .map(([item_id, consumed_quantity]) => ({ item_id, consumed_quantity }));

  if (lines.length === 0) return { ok: false, code: "empty" };

  return { ok: true, lines };
}
