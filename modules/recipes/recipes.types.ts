import type { InventoryItem } from "@/modules/inventory/inventory.types";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type RecipeIngredient = { inventoryItemId?: string; name: string; quantity: number; unit: string; substitutionGroup?: string };
export type GeneratedRecipe = MacroTotals & { id: string; name: string; mealType: MealType; servings: number; ingredients: RecipeIngredient[]; steps: string[]; usedExpiringItems: InventoryItem[]; score: number };
