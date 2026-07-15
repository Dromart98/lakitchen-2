import { type InventoryNutritionAiEstimate, type InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import { isInventoryCategory, type InventoryCategory } from "@/modules/inventory/inventory-categories";
import { isInventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";

export type TransferredInventoryNutritionItem = {
  id: string;
  name: string;
  quantity: number;
  unit: "ud" | "g" | "kg" | "ml" | "l";
  category: string | null;
  nutrition_basis: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type ShoppingListTransferNutritionPlan =
  | { status: "already-complete" }
  | { status: "estimate"; input: InventoryNutritionAiInput }
  | { status: "preserve-existing" }
  | { status: "invalid" };

const transferInventoryUnits = ["ud", "g", "kg", "ml", "l"] as const;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isTransferInventoryUnit(value: string): value is TransferredInventoryNutritionItem["unit"] {
  return transferInventoryUnits.includes(value as TransferredInventoryNutritionItem["unit"]);
}

function normalizeTransferCategory(category: string | null): InventoryCategory | null {
  const normalizedCategory = typeof category === "string" ? category.trim() : null;
  return isInventoryCategory(normalizedCategory) ? normalizedCategory : null;
}

function hasValidNutritionNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasAnyNutritionValue(item: TransferredInventoryNutritionItem) {
  return item.nutrition_basis !== null
    || item.calories !== null
    || item.protein_g !== null
    || item.carbs_g !== null
    || item.fat_g !== null;
}

function hasCompleteValidNutrition(item: TransferredInventoryNutritionItem) {
  return isInventoryNutritionBasis(item.nutrition_basis)
    && hasValidNutritionNumber(item.calories)
    && hasValidNutritionNumber(item.protein_g)
    && hasValidNutritionNumber(item.carbs_g)
    && hasValidNutritionNumber(item.fat_g);
}

export function getShoppingListTransferNutritionPlan(
  item: TransferredInventoryNutritionItem,
): ShoppingListTransferNutritionPlan {
  const name = typeof item.name === "string" ? item.name.trim() : "";

  if (
    !isUuid(item.id)
    || name.length < 2
    || name.length > 120
    || !Number.isFinite(item.quantity)
    || item.quantity <= 0
    || !isTransferInventoryUnit(item.unit)
  ) {
    return { status: "invalid" };
  }

  if (hasCompleteValidNutrition(item)) {
    return { status: "already-complete" };
  }

  if (hasAnyNutritionValue(item)) {
    return { status: "preserve-existing" };
  }

  return {
    status: "estimate",
    input: {
      name,
      quantity: item.quantity,
      unit: item.unit,
      category: normalizeTransferCategory(item.category),
    },
  };
}

export function buildShoppingListTransferNutritionUpdate(estimate: InventoryNutritionAiEstimate) {
  return {
    nutrition_basis: estimate.nutrition_basis,
    calories: estimate.calories,
    protein_g: estimate.protein_g,
    carbs_g: estimate.carbs_g,
    fat_g: estimate.fat_g,
  };
}
