import type { InventoryItem } from "@/modules/inventory/inventory.types";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
export const todayGoal: MacroTotals = { calories: 2200, proteinG: 165, carbsG: 220, fatG: 73 };
export const consumedToday: MacroTotals = { calories: 860, proteinG: 62, carbsG: 94, fatG: 24 };
export const inventory: InventoryItem[] = [
  { id: "1", name: "Pechuga de pollo", location: "fridge", category: "protein meat", quantity: 450, unit: "g", expirationDate: new Date(Date.now()+86400000).toISOString(), status: "available", calories: 165, proteinG: 31, carbsG: 0, fatG: 4 },
  { id: "2", name: "Arroz integral", location: "pantry", category: "carb rice", quantity: 1000, unit: "g", status: "available", calories: 360, proteinG: 7, carbsG: 76, fatG: 3 },
  { id: "3", name: "Brócoli", location: "fridge", category: "vegetable greens", quantity: 300, unit: "g", expirationDate: new Date(Date.now()+2*86400000).toISOString(), status: "available", calories: 34, proteinG: 3, carbsG: 7, fatG: 0 },
  { id: "4", name: "Aceite de oliva", location: "pantry", category: "fat oil", quantity: 500, unit: "ml", status: "available", calories: 884, proteinG: 0, carbsG: 0, fatG: 100 }
];
