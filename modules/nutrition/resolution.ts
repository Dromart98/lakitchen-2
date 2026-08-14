import type { InventoryNutritionAiFoodState } from "@/modules/inventory/inventory-ai-nutrition";
import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";

export type NutritionSource = "user" | "barcode-memory" | "open-food-facts" | "usda" | "ai";

export type ResolvedNutrition = {
  status: "resolved";
  normalizedName: string;
  foodState: InventoryNutritionAiFoodState;
  nutritionBasis: InventoryNutritionBasis;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  needsReview: boolean;
  provenance: { source: NutritionSource; externalId?: string; resolvedAt: string };
  assumptions: string;
};

export type NutritionResolution =
  | ResolvedNutrition
  | { status: "needs-clarification"; message: string }
  | { status: "unresolved"; reason: "not-found" | "not-configured" | "provider-error" | "external-search-limit" | "external-search-unavailable" };

export function isCompleteNutrition(values: { calories: unknown; proteinG: unknown; carbsG: unknown; fatG: unknown }) {
  return [values.calories, values.proteinG, values.carbsG, values.fatG]
    .every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
}
