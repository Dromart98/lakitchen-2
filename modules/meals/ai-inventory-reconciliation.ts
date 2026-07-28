import { calculateMealBuilderTotals, isMealBuilderInventoryItemEligible, type MealBuilderInventoryItem, type MealBuilderLine } from "@/modules/meals/meal-builder";
import { convertFoodQuantity } from "@/modules/units/food-quantity";

export type AiInventoryMatch = { suggestedItemId: string | null; ambiguous: boolean };
const PREPARATION_WORDS = new Set(["crudo", "cruda", "cocido", "cocida", "asado", "asada", "plancha", "a", "la", "al", "pequeno", "pequena"]);
export function normalizeInventoryMatchName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((word) => word && !PREPARATION_WORDS.has(word)).join(" ");
}
export function suggestInventoryMatch(ingredientName: string, items: MealBuilderInventoryItem[]): AiInventoryMatch {
  const target = normalizeInventoryMatchName(ingredientName); const targetTokens = new Set(target.split(" ").filter(Boolean));
  const candidates = items.filter((item) => { const name = normalizeInventoryMatchName(item.name); const tokens = name.split(" ").filter(Boolean); return name === target || (tokens.length > 0 && tokens.every((token) => targetTokens.has(token))) || (targetTokens.size > 0 && [...targetTokens].every((token) => tokens.includes(token))); });
  return candidates.length === 1 ? { suggestedItemId: candidates[0].id, ambiguous: false } : { suggestedItemId: null, ambiguous: candidates.length > 1 };
}
export function convertEstimatedQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  return convertFoodQuantity(quantity, fromUnit, toUnit);
}
export function validateAiInventoryLine(item: MealBuilderInventoryItem | undefined, quantity: number | null): string | null {
  if (!item) return "Selecciona un producto de tu inventario.";
  if (!isMealBuilderInventoryItemEligible(item)) return "Este producto necesita nutrición completa y una unidad compatible.";
  if (!Number.isFinite(quantity) || !quantity || quantity <= 0) return "Indica una cantidad válida.";
  if (quantity > item.quantity) return "La cantidad supera el stock disponible.";
  return null;
}
export function calculateAiInventoryTotals(lines: MealBuilderLine[]) { return calculateMealBuilderTotals(lines); }
