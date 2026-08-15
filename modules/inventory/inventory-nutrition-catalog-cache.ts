import {
  catalogRequestKey,
  confirmedCatalogRow,
  persistConfirmedNutritionBatchWithIdentities,
  type NutritionCatalogRow,
} from "@/modules/nutrition/catalog";
import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";

export const INVENTORY_NUTRITION_CATALOG_TIMEOUT_MS = 2_000;

type CatalogPersistenceResult = {
  persistedCount: number;
  foodCatalogItemIds: Map<string, string | null>;
};

type CatalogClient = Parameters<typeof persistConfirmedNutritionBatchWithIdentities>[0];
type CatalogPersistence = (client: CatalogClient, rows: NutritionCatalogRow[]) => Promise<CatalogPersistenceResult>;

type ConfirmedInventoryNutritionInput = {
  userId: string;
  name: string;
  unit: string;
  nutritionBasis: InventoryNutritionBasis | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  source?: "user" | "barcode-memory";
  externalId?: string | null;
  foodCatalogItemId?: string | null;
};

type CatalogCacheOptions = {
  persist?: CatalogPersistence;
  timeoutMs?: number;
};

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("inventory-nutrition-catalog-timeout")), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function cacheConfirmedInventoryNutrition(
  client: CatalogClient,
  input: ConfirmedInventoryNutritionInput,
  options: CatalogCacheOptions = {},
) {
  if (!input.nutritionBasis || ![input.calories, input.proteinG, input.carbsG, input.fatG]
    .every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) return null;

  try {
    const row = confirmedCatalogRow({
      ...input,
      nutritionBasis: input.nutritionBasis,
      calories: input.calories!,
      proteinG: input.proteinG!,
      carbsG: input.carbsG!,
      fatG: input.fatG!,
    });
    row.food_catalog_item_id = input.foodCatalogItemId ?? null;
    const persist = options.persist ?? persistConfirmedNutritionBatchWithIdentities;
    const result = await withTimeout(persist(client, [row]), options.timeoutMs ?? INVENTORY_NUTRITION_CATALOG_TIMEOUT_MS);
    return result.foodCatalogItemIds.get(catalogRequestKey(row.normalized_name, row.food_state, row.nutrition_basis)) ?? null;
  } catch {
    console.warn("Supabase could not update the nutrition catalog within the inventory save deadline.");
    return input.foodCatalogItemId ?? null;
  }
}
