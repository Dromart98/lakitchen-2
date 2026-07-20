import {
  calculateConsumedInventoryNutrition,
  hasCompleteInventoryNutritionValues,
  type InventoryAvailableNutritionTotals,
  type InventoryNutritionBasis,
} from "@/modules/inventory/inventory-nutrition";
import { isMealType, type MealType } from "@/modules/meals/meal-types";
import { isValidUuid } from "@/modules/meals/meal-validation";

export type MealBuilderReturnPath = "/macros";

export const MAX_MEAL_BUILDER_LINES = 20;

const MEAL_BUILDER_ERROR_MESSAGES: Record<string, string> = {
  "invalid-name": "El nombre de la comida es obligatorio y no puede superar 120 caracteres.",
  "invalid-meal-type": "Selecciona un tipo de comida válido.",
  "invalid-lines-json": "No se pudo leer la selección de productos. Revisa la comida e inténtalo de nuevo.",
  "invalid-lines": "Añade al menos un producto válido a la comida.",
  "too-many-products": "La comida no puede contener más de veinte productos.",
  "duplicate-product": "No puedes registrar el mismo producto más de una vez en la misma comida.",
  "product-not-owned": "Uno de los productos no pertenece a tu inventario.",
  "product-not-found": "Uno de los productos ya no está disponible en tu inventario.",
  "invalid-quantity": "Revisa las cantidades de los productos.",
  "quantity-too-high": "Una cantidad supera el stock disponible actual.",
  "incomplete-nutrition": "Uno de los productos no tiene nutrición completa.",
  "incompatible-unit": "Uno de los productos tiene una unidad incompatible con su base nutricional.",
  "invalid-payload": "Los datos de la comida no son válidos. Revisa la selección e inténtalo de nuevo.",
  "submission-conflict": "Esta confirmación ya se usó con datos distintos. Genera una nueva estimación e inténtalo de nuevo.",
  unauthenticated: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
  "consume-failed": "No se pudo registrar la comida. Inténtalo de nuevo.",
};

export function resolveMealBuilderReturnPath(_value: unknown): MealBuilderReturnPath {
  return "/macros";
}

export function buildMealBuilderResultDestination(kind: "mealError" | "mealSuccess", code: string): string {
  return `/macros?mealMode=ingredients&${kind}=${encodeURIComponent(code)}#registrar-comida`;
}

/** Builds a safe internal destination for historic /meal-builder links. */
export function buildMealBuilderCompatibilityDestination(params: Record<string, string | string[] | undefined> | undefined): string {
  const query = new URLSearchParams({ mealMode: "ingredients" });
  for (const key of ["repeatMeal", "mealError", "mealSuccess"] as const) {
    const value = params?.[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  return `/macros?${query.toString()}#registrar-comida`;
}

export function getMealBuilderMessage(code: string | undefined, success: boolean): string | null {
  if (success) return code === "meal-consumed-logged"
    ? "Comida registrada y productos descontados correctamente."
    : null;

  return code ? MEAL_BUILDER_ERROR_MESSAGES[code] ?? null : null;
}

export type MealBuilderInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category?: string | null;
  nutrition_basis: InventoryNutritionBasis | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type MealBuilderLine = MealBuilderInventoryItem & {
  consumed_quantity: number;
};

export type MealBuilderTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function hasFiniteTotals(totals: InventoryAvailableNutritionTotals | null): totals is MealBuilderTotals {
  return Boolean(
    totals &&
      totals.calories !== null &&
      totals.protein_g !== null &&
      totals.carbs_g !== null &&
      totals.fat_g !== null &&
      Number.isFinite(totals.calories) &&
      Number.isFinite(totals.protein_g) &&
      Number.isFinite(totals.carbs_g) &&
      Number.isFinite(totals.fat_g),
  );
}

export function calculateMealBuilderLineNutrition(line: MealBuilderLine): MealBuilderTotals | null {
  if (!hasCompleteInventoryNutritionValues(line)) return null;
  if (!Number.isFinite(line.consumed_quantity) || line.consumed_quantity <= 0) return null;
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return null;
  if (line.consumed_quantity > line.quantity) return null;

  const totals = calculateConsumedInventoryNutrition(line);

  return hasFiniteTotals(totals) ? totals : null;
}

export function isMealBuilderInventoryItemEligible(item: MealBuilderInventoryItem): boolean {
  if (!item.nutrition_basis) return false;
  if (!hasCompleteInventoryNutritionValues(item)) return false;
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return false;

  return calculateConsumedInventoryNutrition({
    ...item,
    consumed_quantity: 1,
  }) !== null;
}

export function calculateMealBuilderTotals(lines: MealBuilderLine[]): MealBuilderTotals | null {
  if (!lines.length) return null;

  const seenItemIds = new Set<string>();
  const totals: MealBuilderTotals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };

  for (const line of lines) {
    if (seenItemIds.has(line.id)) return null;
    seenItemIds.add(line.id);

    const lineTotals = calculateMealBuilderLineNutrition(line);

    if (!lineTotals) return null;

    totals.calories += lineTotals.calories;
    totals.protein_g += lineTotals.protein_g;
    totals.carbs_g += lineTotals.carbs_g;
    totals.fat_g += lineTotals.fat_g;
  }

  return totals;
}

export type MealBuilderConsumptionPayloadLine = {
  item_id: string;
  consumed_quantity: number;
};

export type MealBuilderConsumptionLinesValidation =
  | { lines: MealBuilderConsumptionPayloadLine[] }
  | {
    error:
      | "invalid-lines-json"
      | "invalid-lines"
      | "too-many-products"
      | "product-not-found"
      | "duplicate-product"
      | "invalid-quantity";
  };

/** Validates the untrusted form payload before the single atomic inventory RPC. */
export function parseMealBuilderConsumptionLines(rawLines: unknown): MealBuilderConsumptionLinesValidation {
  if (typeof rawLines !== "string") return { error: "invalid-lines-json" };

  let parsedLines: unknown;

  try {
    parsedLines = JSON.parse(rawLines);
  } catch {
    return { error: "invalid-lines-json" };
  }

  if (!Array.isArray(parsedLines)) return { error: "invalid-lines-json" };
  if (parsedLines.length < 1) return { error: "invalid-lines" };
  if (parsedLines.length > MAX_MEAL_BUILDER_LINES) return { error: "too-many-products" };

  const seenItemIds = new Set<string>();
  const lines: MealBuilderConsumptionPayloadLine[] = [];

  for (const line of parsedLines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return { error: "invalid-lines-json" };

    const { item_id: itemId, consumed_quantity: consumedQuantity } = line as {
      item_id: unknown;
      consumed_quantity: unknown;
    };

    if (!isValidUuid(itemId)) return { error: "product-not-found" };
    if (seenItemIds.has(itemId)) return { error: "duplicate-product" };

    const quantity = Number(consumedQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: "invalid-quantity" };

    seenItemIds.add(itemId);
    lines.push({ item_id: itemId, consumed_quantity: quantity });
  }

  return { lines };
}

export function createMealBuilderConsumptionPayload(
  lines: MealBuilderLine[],
): MealBuilderConsumptionPayloadLine[] | null {
  if (!lines.length || lines.length > MAX_MEAL_BUILDER_LINES) return null;
  if (!calculateMealBuilderTotals(lines)) return null;

  const seenItemIds = new Set<string>();
  const payload: MealBuilderConsumptionPayloadLine[] = [];

  for (const line of lines) {
    if (seenItemIds.has(line.id)) return null;
    seenItemIds.add(line.id);

    payload.push({
      item_id: line.id,
      consumed_quantity: line.consumed_quantity,
    });
  }

  return payload;
}

export type RepeatedMealBuilderMeal = {
  name: string;
  meal_type: string | null;
};

export type RepeatedMealBuilderSnapshot = {
  source_inventory_item_id: string;
  product_name: string;
  consumed_quantity: number | string;
  unit: string;
};

export type RepeatedMealBuilderDraftLine = {
  itemId: string;
  quantity: string;
};

export type RepeatedMealBuilderUnavailableItem = {
  sourceInventoryItemId: string;
  productName: string;
  consumedQuantity: number;
  unit: string;
  reason: "missing" | "incompatible";
};

export type RepeatedMealBuilderDraft = {
  mealName: string;
  mealType: MealType | "";
  availableLines: RepeatedMealBuilderDraftLine[];
  unavailableItems: RepeatedMealBuilderUnavailableItem[];
};


export function createRepeatedMealBuilderDraft(
  meal: RepeatedMealBuilderMeal,
  snapshots: RepeatedMealBuilderSnapshot[],
  inventoryItems: MealBuilderInventoryItem[],
): RepeatedMealBuilderDraft {
  const inventoryItemsById = new Map(inventoryItems.map((item) => [item.id, item]));
  const seenSnapshotItemIds = new Set<string>();
  const availableLines: RepeatedMealBuilderDraftLine[] = [];
  const unavailableItems: RepeatedMealBuilderUnavailableItem[] = [];

  for (const snapshot of snapshots) {
    if (seenSnapshotItemIds.has(snapshot.source_inventory_item_id)) continue;
    seenSnapshotItemIds.add(snapshot.source_inventory_item_id);

    const consumedQuantity = Number(snapshot.consumed_quantity);
    const unavailableItem: RepeatedMealBuilderUnavailableItem = {
      sourceInventoryItemId: snapshot.source_inventory_item_id,
      productName: snapshot.product_name,
      consumedQuantity: Number.isFinite(consumedQuantity) ? consumedQuantity : 0,
      unit: snapshot.unit,
      reason: "missing",
    };
    const currentItem = inventoryItemsById.get(snapshot.source_inventory_item_id);

    if (!currentItem) {
      unavailableItems.push(unavailableItem);
      continue;
    }

    if (
      !Number.isFinite(consumedQuantity) ||
      consumedQuantity <= 0 ||
      !isMealBuilderInventoryItemEligible(currentItem)
    ) {
      unavailableItems.push({ ...unavailableItem, reason: "incompatible" });
      continue;
    }

    if (availableLines.length >= MAX_MEAL_BUILDER_LINES) continue;

    availableLines.push({
      itemId: currentItem.id,
      quantity: String(consumedQuantity),
    });
  }

  return {
    mealName: meal.name,
    mealType: isMealType(meal.meal_type) ? meal.meal_type : "",
    availableLines,
    unavailableItems: unavailableItems.sort((a, b) => {
      const nameComparison = a.productName.localeCompare(b.productName, "es", {
        sensitivity: "base",
        numeric: true,
      });

      if (nameComparison !== 0) return nameComparison;

      return a.sourceInventoryItemId.localeCompare(b.sourceInventoryItemId);
    }),
  };
}

export function formatMealBuilderNutritionValue(value: number): string | null {
  if (!Number.isFinite(value)) return null;

  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
}
