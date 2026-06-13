import { daysUntilExpiration } from "@/modules/inventory/inventory.rules";
import type { InventoryItem } from "@/modules/inventory/inventory.types";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
import type { GeneratedRecipe, MealType } from "./recipes.types";

const proteinCategories = ["protein", "meat", "fish", "legume", "dairy", "tofu"];
const carbCategories = ["carb", "grain", "pasta", "rice", "bread", "potato", "fruit"];
const fatCategories = ["fat", "oil", "nuts", "avocado", "cheese"];
const veggieCategories = ["vegetable", "veg", "greens"];

function inGroup(item: InventoryItem, groups: string[]) { return groups.some((group) => item.category.toLowerCase().includes(group)); }
function pick(items: InventoryItem[], groups: string[]) { return items.find((item) => inGroup(item, groups)); }
function expirationPriority(item: InventoryItem) { const days = daysUntilExpiration(item); if (days === null) return 0.1; if (days <= 1) return 1; if (days <= 3) return 0.8; if (days <= 7) return 0.5; return 0.2; }

export function generateRecipe({ items, mealType, macroTarget, servings = 1, avoid = [] }: { items: InventoryItem[]; mealType: MealType; macroTarget: Partial<MacroTotals>; servings?: number; avoid?: string[] }): GeneratedRecipe {
  const available = items.filter((item) => item.status === "available" && item.quantity > 0 && !avoid.some((term) => item.name.toLowerCase().includes(term.toLowerCase()))).sort((a, b) => expirationPriority(b) - expirationPriority(a));
  if (!available.length) throw new Error("No hay ingredientes disponibles para generar una receta.");
  const selected = [pick(available, proteinCategories), pick(available, carbCategories), pick(available, veggieCategories), pick(available, fatCategories)].filter(Boolean) as InventoryItem[];
  const unique = [...new Map((selected.length ? selected : available.slice(0, 4)).map((item) => [item.id, item])).values()];
  const totals = unique.reduce<MacroTotals>((acc, item) => ({ calories: acc.calories + Math.round(item.calories / Math.max(1, servings)), proteinG: acc.proteinG + item.proteinG, carbsG: acc.carbsG + item.carbsG, fatG: acc.fatG + item.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const macroFit = macroTarget.calories ? Math.max(0, 1 - Math.abs(totals.calories - macroTarget.calories) / macroTarget.calories) : 0.7;
  const expiring = unique.filter((item) => (daysUntilExpiration(item) ?? 99) <= 3);
  const score = Number(((expiring.length ? 0.35 : 0.1) + macroFit * 0.3 + 0.25 + 0.1).toFixed(2));
  return { id: `generated-${Date.now()}`, name: recipeName(mealType, unique), mealType, servings, ...totals, ingredients: unique.map((item) => ({ inventoryItemId: item.id, name: item.name, quantity: Math.min(item.quantity, item.unit === "unit" ? 1 : 100), unit: item.unit, substitutionGroup: item.category })), steps: ["Prepara y pesa todos los ingredientes.", "Cocina primero la proteína y la base de carbohidrato si aplica.", "Añade verduras, grasas saludables y condimentos al gusto.", "Sirve la ración y registra la receta como preparada para descontar inventario."], usedExpiringItems: expiring, score };
}
function recipeName(mealType: MealType, items: InventoryItem[]) { const prefix: Record<MealType, string> = { breakfast: "Desayuno", lunch: "Comida", dinner: "Cena", snack: "Snack" }; return `${prefix[mealType]} con ${items.slice(0, 2).map((item) => item.name).join(" y ")}`; }
