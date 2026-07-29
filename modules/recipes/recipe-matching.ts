import { getInventoryExpirationDayDifference } from "@/modules/inventory/inventory-expiration";
import { calculateConsumedInventoryNutritionWithMetadata, type InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import type { InventoryConfirmedUnitMeasure } from "@/modules/inventory/inventory-unit-equivalence";
import {
  areFoodQuantityUnitsCompatible,
  convertFoodQuantityToCanonical,
  convertFoodQuantity,
  type CanonicalFoodQuantityUnit,
  type FoodQuantityUnit,
} from "@/modules/units/food-quantity";

export type RecipeUnit = FoodQuantityUnit;
export type RecipeIngredientStatus = "available" | "missing" | "insufficient" | "incompatible" | "expired";
export type RecipeFilterMode = "all" | "available" | "quick" | "urgent";

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  display_name: string;
  match_terms: string[];
  required_quantity: number;
  required_unit: RecipeUnit;
  is_required: boolean;
  sort_order: number;
};

export type RecipeTemplate = {
  id: string;
  slug: string;
  title: string;
  description: string;
  prep_minutes: number;
  servings: number;
  instructions: string[];
  recipe_ingredients: RecipeIngredient[];
};

export type RecipeInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expires_at: string | null;
  nutrition_basis?: InventoryNutritionBasis | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  foodIdentity?: RecipeFoodIdentity;
  confirmedUnitMeasure?: InventoryConfirmedUnitMeasure | null;
};

export type RecipeFoodIdentity =
  | { status: "none" }
  | { status: "unresolved" }
  | { status: "resolved"; normalizedName: string; aliases: string[] };

export type RecipeInventoryItemRow = Omit<RecipeInventoryItem, "foodIdentity"> & {
  food_catalog_item_id?: unknown;
  food_catalog_items?: unknown;
};

export function attachRecipeInventoryUnitMeasures(
  rows: readonly RecipeInventoryItemRow[],
  measures: ReadonlyMap<string, InventoryConfirmedUnitMeasure>,
): RecipeInventoryItem[] {
  return rows.map((row) => {
    const identity = typeof row.food_catalog_item_id === "string" ? row.food_catalog_item_id : "";
    return toRecipeInventoryItem({ ...row, confirmedUnitMeasure: measures.get(identity) ?? null });
  });
}

export type RecipeIngredientAllocation = {
  inventoryItemId: string;
  inventoryItemName: string;
  usedQuantity: number;
  usedUnit: "g" | "ml" | "ud";
  originalQuantity?: number;
  originalUnit?: string;
  confirmedUnitMeasure?: InventoryConfirmedUnitMeasure | null;
  usedConfirmedUnitMeasure?: boolean;
  nutritionBasis: InventoryNutritionBasis | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type RecipeIngredientMatch = {
  ingredient: RecipeIngredient;
  status: RecipeIngredientStatus;
  availableQuantity: number;
  requiredQuantity: number;
  baseUnit: "g" | "ml" | "ud" | null;
  matchedItemCount: number;
  urgentItemCount: number;
  nearestExpirationDate: string | null;
  allocations: RecipeIngredientAllocation[];
};

export type RecipeMatchResult = {
  recipe: RecipeTemplate;
  ingredientMatches: RecipeIngredientMatch[];
  canCookNow: boolean;
  requiredIngredientCount: number;
  availableRequiredIngredientCount: number;
  completionRatio: number;
  urgentItemCount: number;
  nearestExpirationDate: string | null;
};

type BaseUnit = CanonicalFoodQuantityUnit;

type StockCopy = RecipeInventoryItem & {
  matchTerms: Set<string>;
  remainingOriginalQuantity: number;
};

export function toRecipeInventoryItem(row: RecipeInventoryItemRow): RecipeInventoryItem {
  const relation = row.food_catalog_items;
  const hasIdentityReference = row.food_catalog_item_id !== null && row.food_catalog_item_id !== undefined;
  let foodIdentity: RecipeFoodIdentity = hasIdentityReference ? { status: "unresolved" } : { status: "none" };

  if (hasIdentityReference && relation && typeof relation === "object" && !Array.isArray(relation)) {
    const rawNormalizedName = Reflect.get(relation, "normalized_name");
    const normalizedName = typeof rawNormalizedName === "string" ? normalizeRecipeMatchTerm(rawNormalizedName) : "";
    const rawAliases = Reflect.get(relation, "aliases");
    if (normalizedName) {
      const aliases = [...new Set((Array.isArray(rawAliases) ? rawAliases : [])
        .filter((alias): alias is string => typeof alias === "string")
        .map(normalizeRecipeMatchTerm)
        .filter((alias) => alias && alias !== normalizedName))];
      foodIdentity = { status: "resolved", normalizedName, aliases };
    }
  }

  const { food_catalog_item_id: _foodCatalogItemId, food_catalog_items: _foodCatalogItems, ...inventoryItem } = row;
  return { ...inventoryItem, foodIdentity };
}

export function normalizeRecipeMatchTerm(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function areRecipeUnitsCompatible(firstUnit: string, secondUnit: string): boolean {
  return areFoodQuantityUnitsCompatible(firstUnit, secondUnit);
}

export function convertRecipeQuantityToBase(quantity: number, unit: string): { quantity: number; unit: BaseUnit } | null {
  return convertFoodQuantityToCanonical(quantity, unit);
}

function compareExpiration(first: string | null, second: string | null): number {
  if (first === second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return first.localeCompare(second);
}

function isExpired(expiresAt: string | null, todayKey: string): boolean {
  return Boolean(expiresAt && getInventoryExpirationDayDifference(expiresAt, todayKey) < 0);
}

function isUrgent(expiresAt: string | null, todayKey: string): boolean {
  if (!expiresAt) return false;
  const difference = getInventoryExpirationDayDifference(expiresAt, todayKey);
  return difference >= 0 && difference <= 7;
}

function convertStockQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: BaseUnit,
  measure: InventoryConfirmedUnitMeasure | null | undefined,
): { quantity: number; usedMeasure: boolean } | null {
  const exact = convertFoodQuantityToCanonical(quantity, fromUnit);
  if (exact?.unit === toUnit) return { quantity: exact.quantity, usedMeasure: false };
  if (!measure || !Number.isFinite(measure.canonicalQuantity) || measure.canonicalQuantity <= 0) return null;
  if (fromUnit === "ud" && measure.canonicalUnit === toUnit) {
    return { quantity: quantity * measure.canonicalQuantity, usedMeasure: true };
  }
  if (toUnit === "ud") {
    const canonical = convertFoodQuantityToCanonical(quantity, fromUnit);
    if (canonical?.unit === measure.canonicalUnit) {
      return { quantity: canonical.quantity / measure.canonicalQuantity, usedMeasure: true };
    }
  }
  return null;
}

function convertAllocationToOriginal(
  quantity: number,
  fromUnit: BaseUnit,
  item: StockCopy,
): { quantity: number; usedMeasure: boolean } | null {
  const exact = convertFoodQuantity(quantity, fromUnit, item.unit);
  if (exact !== null) return { quantity: exact, usedMeasure: false };
  const measure = item.confirmedUnitMeasure;
  if (!measure || !Number.isFinite(measure.canonicalQuantity) || measure.canonicalQuantity <= 0) return null;
  if (item.unit === "ud" && fromUnit === measure.canonicalUnit) {
    return { quantity: quantity / measure.canonicalQuantity, usedMeasure: true };
  }
  if (fromUnit === "ud") {
    const originalCanonical = convertFoodQuantityToCanonical(1, item.unit);
    if (originalCanonical?.unit === measure.canonicalUnit) {
      return { quantity: quantity * measure.canonicalQuantity / originalCanonical.quantity, usedMeasure: true };
    }
  }
  return null;
}

function matchIngredient(ingredient: RecipeIngredient, stock: StockCopy[], todayKey: string): RecipeIngredientMatch {
  const required = convertRecipeQuantityToBase(ingredient.required_quantity, ingredient.required_unit);
  const terms = new Set(ingredient.match_terms.map(normalizeRecipeMatchTerm).filter(Boolean));
  const nameMatches = stock.filter((item) => [...item.matchTerms].some((term) => terms.has(term)));

  if (!required || nameMatches.length === 0) {
    return { ingredient, status: "missing", availableQuantity: 0, requiredQuantity: required?.quantity ?? 0, baseUnit: required?.unit ?? null, matchedItemCount: 0, urgentItemCount: 0, nearestExpirationDate: null, allocations: [] };
  }

  const compatible = nameMatches.filter((item) => convertStockQuantity(1, item.unit, required.unit, item.confirmedUnitMeasure) !== null);
  if (compatible.length === 0) {
    return { ingredient, status: "incompatible", availableQuantity: 0, requiredQuantity: required.quantity, baseUnit: required.unit, matchedItemCount: nameMatches.length, urgentItemCount: 0, nearestExpirationDate: null, allocations: [] };
  }

  const valid = compatible
    .filter((item) => !isExpired(item.expires_at, todayKey) && item.remainingOriginalQuantity > 0)
    .sort((first, second) => compareExpiration(first.expires_at, second.expires_at) || first.name.localeCompare(second.name, "es") || first.id.localeCompare(second.id));

  const expiredCompatibleCount = compatible.filter((item) => isExpired(item.expires_at, todayKey) && item.remainingOriginalQuantity > 0).length;
  let availableQuantity = 0;
  const used: StockCopy[] = [];
  const allocations: RecipeIngredientAllocation[] = [];

  for (const item of valid) {
    if (availableQuantity >= required.quantity) break;
    const available = convertStockQuantity(item.remainingOriginalQuantity, item.unit, required.unit, item.confirmedUnitMeasure);
    if (!available) continue;
    const usedQuantity = Math.min(required.quantity - availableQuantity, available.quantity);
    if (usedQuantity > 0) {
      const original = convertAllocationToOriginal(usedQuantity, required.unit, item);
      if (!original || original.quantity > item.remainingOriginalQuantity) continue;
      availableQuantity += usedQuantity;
      item.remainingOriginalQuantity -= original.quantity;
      used.push(item);
      const allocation: RecipeIngredientAllocation = {
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        usedQuantity,
        usedUnit: required.unit,
        originalQuantity: original.quantity,
        originalUnit: item.unit,
        confirmedUnitMeasure: item.confirmedUnitMeasure ?? null,
        usedConfirmedUnitMeasure: available.usedMeasure || original.usedMeasure,
        nutritionBasis: item.nutrition_basis ?? null,
        calories: item.calories ?? null,
        proteinG: item.protein_g ?? null,
        carbsG: item.carbs_g ?? null,
        fatG: item.fat_g ?? null,
      };
      const nutrition = calculateConsumedInventoryNutritionWithMetadata({
        consumed_quantity: allocation.usedQuantity,
        unit: allocation.usedUnit,
        nutrition_basis: allocation.nutritionBasis,
        calories: allocation.calories,
        protein_g: allocation.proteinG,
        carbs_g: allocation.carbsG,
        fat_g: allocation.fatG,
        confirmedUnitMeasure: allocation.confirmedUnitMeasure,
      });
      allocation.usedConfirmedUnitMeasure ||= nutrition?.usedConfirmedUnitMeasure === true;
      allocations.push(allocation);
    }
  }

  const urgentItemIds = new Set(used.filter((item) => isUrgent(item.expires_at, todayKey)).map((item) => item.id));
  const expirationDates = used.map((item) => item.expires_at).filter((date): date is string => Boolean(date));
  const nearestExpirationDate = expirationDates.sort()[0] ?? null;

  if (availableQuantity >= required.quantity) {
    return { ingredient, status: "available", availableQuantity, requiredQuantity: required.quantity, baseUnit: required.unit, matchedItemCount: compatible.length, urgentItemCount: urgentItemIds.size, nearestExpirationDate, allocations };
  }

  return {
    ingredient,
    status: availableQuantity > 0 ? "insufficient" : expiredCompatibleCount > 0 ? "expired" : "insufficient",
    availableQuantity,
    requiredQuantity: required.quantity,
    baseUnit: required.unit,
    matchedItemCount: compatible.length,
    urgentItemCount: 0,
    nearestExpirationDate,
    allocations,
  };
}

export function matchRecipesToInventory(recipes: RecipeTemplate[], inventory: RecipeInventoryItem[], todayKey: string): RecipeMatchResult[] {
  return recipes.map((recipe) => {
    const stock: StockCopy[] = inventory.map((item) => {
      const matchTerms = item.foodIdentity?.status === "resolved"
        ? new Set([item.foodIdentity.normalizedName, ...item.foodIdentity.aliases])
        : item.foodIdentity?.status === "unresolved"
          ? new Set<string>()
          : new Set([normalizeRecipeMatchTerm(item.name)]);
      return { ...item, matchTerms, remainingOriginalQuantity: item.quantity };
    });

    const ingredients = [...recipe.recipe_ingredients].sort((first, second) => first.sort_order - second.sort_order || first.display_name.localeCompare(second.display_name, "es"));
    const allocationOrder = [
      ...ingredients.filter((ingredient) => ingredient.is_required),
      ...ingredients.filter((ingredient) => !ingredient.is_required),
    ];
    const matchesByIngredientId = new Map(allocationOrder.map((ingredient) => [ingredient.id, matchIngredient(ingredient, stock, todayKey)]));
    const ingredientMatches = ingredients.map((ingredient) => matchesByIngredientId.get(ingredient.id)).filter((match): match is RecipeIngredientMatch => Boolean(match));
    const requiredMatches = ingredientMatches.filter((match) => match.ingredient.is_required);
    const availableRequiredIngredientCount = requiredMatches.filter((match) => match.status === "available").length;
    const requiredIngredientCount = requiredMatches.length;
    const urgentItemCount = ingredientMatches.reduce((total, match) => total + match.urgentItemCount, 0);
    const expirationDates = ingredientMatches.map((match) => match.nearestExpirationDate).filter((date): date is string => Boolean(date)).sort();

    return {
      recipe,
      ingredientMatches,
      canCookNow: requiredIngredientCount > 0 && availableRequiredIngredientCount === requiredIngredientCount,
      requiredIngredientCount,
      availableRequiredIngredientCount,
      completionRatio: requiredIngredientCount === 0 ? 0 : availableRequiredIngredientCount / requiredIngredientCount,
      urgentItemCount,
      nearestExpirationDate: expirationDates[0] ?? null,
    };
  });
}

export function sortRecipeMatches(matches: RecipeMatchResult[]): RecipeMatchResult[] {
  return matches
    .map((match, index) => ({ match, index }))
    .sort((first, second) => {
      if (first.match.canCookNow !== second.match.canCookNow) return first.match.canCookNow ? -1 : 1;
      if (first.match.urgentItemCount !== second.match.urgentItemCount) return second.match.urgentItemCount - first.match.urgentItemCount;
      if (first.match.completionRatio !== second.match.completionRatio) return second.match.completionRatio - first.match.completionRatio;
      if (first.match.recipe.prep_minutes !== second.match.recipe.prep_minutes) return first.match.recipe.prep_minutes - second.match.recipe.prep_minutes;
      return first.match.recipe.title.localeCompare(second.match.recipe.title, "es") || first.index - second.index;
    })
    .map(({ match }) => match);
}

export function normalizeRecipeFilterMode(mode: string | undefined): RecipeFilterMode {
  if (mode === "available" || mode === "quick" || mode === "urgent") return mode;
  return "all";
}

export function filterRecipeMatches(matches: RecipeMatchResult[], mode: string | undefined): RecipeMatchResult[] {
  const normalizedMode = normalizeRecipeFilterMode(mode);
  if (normalizedMode === "available") return matches.filter((match) => match.canCookNow);
  if (normalizedMode === "quick") return matches.filter((match) => match.canCookNow && match.recipe.prep_minutes <= 15);
  if (normalizedMode === "urgent") return matches.filter((match) => match.canCookNow && match.urgentItemCount > 0);
  return [...matches];
}
