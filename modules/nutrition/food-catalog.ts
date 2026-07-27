import { normalizeNutritionCatalogName, type NutritionCatalogFoodState } from "@/modules/nutrition/catalog";
import type { NutritionSource } from "@/modules/nutrition/resolution";

type FoodCatalogClient = any;

export type FoodCatalogIdentityInput = {
  userId: string;
  displayName: string;
  providerName?: string | null;
  foodState: NutritionCatalogFoodState;
  identitySource: NutritionSource;
  externalId?: string | null;
  userConfirmed: boolean;
  existingFoodCatalogItemId?: string | null;
};

/** Resolves only identities backed by an existing link, provider ID, exact name, or recorded alias. */
export async function resolveOrCreateFoodCatalogItemForUser(client: FoodCatalogClient, input: FoodCatalogIdentityInput) {
  const normalizedName = normalizeNutritionCatalogName(input.displayName);
  if (!normalizedName) throw new Error("food-catalog-name-empty");
  const aliases = [input.providerName]
    .map((name) => normalizeNutritionCatalogName(name ?? ""))
    .filter((name) => name && name !== normalizedName);
  const result = await client.rpc("resolve_or_create_food_catalog_item", {
    p_user_id: input.userId,
    p_display_name: input.displayName.trim(),
    p_normalized_name: normalizedName,
    p_aliases: aliases,
    p_food_state: input.foodState,
    p_identity_source: input.identitySource,
    p_external_id: input.externalId ?? null,
    p_user_confirmed: input.userConfirmed,
    p_existing_food_catalog_item_id: input.existingFoodCatalogItemId ?? null,
  });
  if (result.error) throw new Error(result.error.message);
  if (typeof result.data !== "string" || !result.data) throw new Error("food-catalog-resolution-empty");
  return result.data;
}
