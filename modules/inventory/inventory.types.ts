import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
export type InventoryLocation = "pantry" | "fridge" | "freezer";
export type InventoryStatus = "available" | "low" | "consumed" | "discarded";
export type Unit = "g" | "kg" | "ml" | "l" | "unit" | "serving";
export type InventoryItem = MacroTotals & { id: string; name: string; location: InventoryLocation; category: string; quantity: number; unit: Unit; expirationDate?: string; status: InventoryStatus; };
