import type { InventoryCategory } from "@/modules/inventory/inventory-categories";
import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
export type InventoryLocation = "pantry" | "fridge" | "freezer";
export type InventoryStatus = "available" | "low" | "consumed" | "discarded";
export type Unit = "g" | "kg" | "ml" | "l" | "unit" | "serving";

export type InventoryItemRecord = {
  id: string;
  food_catalog_item_id: string | null;
  name: string;
  location: InventoryLocation;
  category: InventoryCategory | null;
  nutrition_basis: InventoryNutritionBasis | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  quantity: number;
  unit: string;
  expires_at: string | null;
  created_at: string;
};
export type InventoryItem = MacroTotals & { id: string; name: string; location: InventoryLocation; category: string; quantity: number; unit: Unit; expirationDate?: string; status: InventoryStatus; };
