import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import { getInventoryNutritionFoodStateExpectation } from "@/modules/inventory/inventory-ai-nutrition";
import type { NutritionSource, ResolvedNutrition } from "@/modules/nutrition/resolution";

export const NUTRITION_CATALOG_FRESHNESS_MS: Record<NutritionSource, number> = {
  user: Number.POSITIVE_INFINITY,
  "barcode-memory": Number.POSITIVE_INFINITY,
  "open-food-facts": 30 * 24 * 60 * 60 * 1000,
  usda: 90 * 24 * 60 * 60 * 1000,
  ai: 14 * 24 * 60 * 60 * 1000,
};

export type NutritionCatalogFoodState = "raw" | "cooked" | "drained" | "frozen" | "processed" | "not_applicable" | "unknown";
export type NutritionCatalogRow = {
  id?: string; user_id: string; food_catalog_item_id?: string | null; identity_display_name?: string; normalized_name: string; aliases: string[];
  food_state: NutritionCatalogFoodState; nutrition_basis: InventoryNutritionBasis;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  source: NutritionSource; external_id: string | null; match_confidence: "low" | "medium" | "high";
  user_confirmed: boolean; verified: boolean; resolved_at: string; updated_at?: string;
  refresh_after: string | null;
};

const SOURCE_PRIORITY: Record<NutritionSource, number> = { ai: 1, usda: 2, "open-food-facts": 3, "barcode-memory": 4, user: 5 };

export function normalizeNutritionCatalogName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function inferCatalogFoodState(name: string): NutritionCatalogFoodState {
  return getInventoryNutritionFoodStateExpectation(name)?.state ?? "unknown";
}

export function catalogBasisForUnit(unit: string): InventoryNutritionBasis {
  return unit === "ud" ? "per_unit" : unit === "ml" || unit === "l" ? "per_100ml" : "per_100g";
}

export function getCatalogRefreshAfter(source: NutritionSource, resolvedAt: string) {
  const duration = NUTRITION_CATALOG_FRESHNESS_MS[source];
  return Number.isFinite(duration) ? new Date(Date.parse(resolvedAt) + duration).toISOString() : null;
}

export function isCatalogRowFresh(row: Pick<NutritionCatalogRow, "user_confirmed" | "refresh_after">, now = Date.now()) {
  if (row.user_confirmed) return true;
  const refreshAfter = row.refresh_after === null ? Number.NaN : Date.parse(row.refresh_after);
  return Number.isFinite(refreshAfter) && now <= refreshAfter;
}

export function shouldReplaceCatalogRow(existing: NutritionCatalogRow, incoming: NutritionCatalogRow, now = Date.now()) {
  if (incoming.user_confirmed) return incoming.source === "user" || existing.source !== "user";
  if (existing.user_confirmed) return false;
  if (!isCatalogRowFresh(existing, now)) return true;
  return SOURCE_PRIORITY[incoming.source] >= SOURCE_PRIORITY[existing.source];
}

function complete(row: NutritionCatalogRow) {
  return [row.calories, row.protein_g, row.carbs_g, row.fat_g].every((value) => Number.isFinite(value) && value >= 0);
}

function matches(row: NutritionCatalogRow, name: string, state: NutritionCatalogFoodState, basis: InventoryNutritionBasis) {
  const key = normalizeNutritionCatalogName(name);
  return row.food_state === state && row.nutrition_basis === basis
    && (row.normalized_name === key || row.aliases.includes(key));
}

export function selectCatalogMatch(rows: NutritionCatalogRow[], name: string, state: NutritionCatalogFoodState, basis: InventoryNutritionBasis, now = Date.now()) {
  return rows.filter((row) => matches(row, name, state, basis) && complete(row) && isCatalogRowFresh(row, now))
    .sort((a, b) => Number(b.user_confirmed) - Number(a.user_confirmed) || SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source])[0] ?? null;
}

type CatalogClient = any;
const CATALOG_COLUMNS = "id,user_id,food_catalog_item_id,normalized_name,aliases,food_state,nutrition_basis,calories,protein_g,carbs_g,fat_g,source,external_id,match_confidence,user_confirmed,verified,resolved_at,refresh_after,updated_at";

export async function findNutritionCatalogMatches(client: CatalogClient, userId: string, requests: Array<{ name: string; foodState: NutritionCatalogFoodState; nutritionBasis: InventoryNutritionBasis }>) {
  const keys = [...new Set(requests.map((request) => normalizeNutritionCatalogName(request.name)).filter(Boolean))];
  if (!keys.length) return new Map<string, NutritionCatalogRow>();
  const [exact, aliases] = await Promise.all([
    client.from("nutrition_catalog_items").select(CATALOG_COLUMNS).eq("user_id", userId).in("normalized_name", keys),
    client.from("nutrition_catalog_items").select(CATALOG_COLUMNS).eq("user_id", userId).overlaps("aliases", keys),
  ]);
  if (exact.error || aliases.error) throw new Error(exact.error?.message ?? aliases.error?.message ?? "catalog-query-failed");
  const rows = [...(exact.data ?? []), ...(aliases.data ?? [])] as NutritionCatalogRow[];
  const result = new Map<string, NutritionCatalogRow>();
  for (const request of requests) {
    const identity = catalogRequestKey(request.name, request.foodState, request.nutritionBasis);
    if (!result.has(identity)) {
      const match = selectCatalogMatch(rows, request.name, request.foodState, request.nutritionBasis);
      if (match) result.set(identity, match);
    }
  }
  return result;
}

export function catalogRequestKey(name: string, state: NutritionCatalogFoodState, basis: InventoryNutritionBasis) {
  return `${normalizeNutritionCatalogName(name)}\u0000${state}\u0000${basis}`;
}

export async function persistNutritionCatalogRow(client: CatalogClient, incoming: NutritionCatalogRow) {
  if (!complete(incoming) || !incoming.normalized_name) return false;
  const { resolveOrCreateFoodCatalogItemForUser } = await import("@/modules/nutrition/food-catalog");
  let foodCatalogItemId = incoming.food_catalog_item_id ?? null;
  try {
    foodCatalogItemId = await resolveOrCreateFoodCatalogItemForUser(client, {
      userId: incoming.user_id, displayName: incoming.identity_display_name ?? incoming.normalized_name, providerName: incoming.aliases[0],
      foodState: incoming.food_state, identitySource: incoming.source, externalId: incoming.external_id,
      userConfirmed: incoming.user_confirmed, existingFoodCatalogItemId: foodCatalogItemId,
    });
  } catch (error) {
    console.warn("Supabase could not link the food identity:", error instanceof Error ? error.message : error);
  }
  const payload = { ...incoming, food_catalog_item_id: foodCatalogItemId, aliases: [...new Set(incoming.aliases.map(normalizeNutritionCatalogName).filter(Boolean))] };
  const result = await client.rpc("upsert_nutrition_catalog_items", { p_items: [payload] });
  if (result.error) throw new Error(result.error.message);
  return Number(result.data) > 0;
}

export function catalogRowFromResolution(userId: string, requestedName: string, resolution: ResolvedNutrition): NutritionCatalogRow {
  const normalizedRequestedName = normalizeNutritionCatalogName(requestedName);
  const normalizedProviderName = normalizeNutritionCatalogName(resolution.normalizedName);
  return { user_id: userId, identity_display_name: requestedName.trim(), normalized_name: normalizedRequestedName, aliases: normalizedProviderName && normalizedProviderName !== normalizedRequestedName ? [normalizedProviderName] : [],
    food_state: resolution.foodState, nutrition_basis: resolution.nutritionBasis, calories: resolution.calories,
    protein_g: resolution.proteinG, carbs_g: resolution.carbsG, fat_g: resolution.fatG,
    source: resolution.provenance.source, external_id: resolution.provenance.externalId ?? null,
    match_confidence: resolution.needsReview ? "medium" : "high", user_confirmed: false,
    verified: resolution.provenance.source === "usda" || resolution.provenance.source === "open-food-facts",
    resolved_at: resolution.provenance.resolvedAt, refresh_after: getCatalogRefreshAfter(resolution.provenance.source, resolution.provenance.resolvedAt) };
}

export function confirmedCatalogRow(input: { userId: string; name: string; unit: string; foodState?: NutritionCatalogFoodState; nutritionBasis: InventoryNutritionBasis; calories: number; proteinG: number; carbsG: number; fatG: number; source?: "user" | "barcode-memory"; externalId?: string | null }): NutritionCatalogRow {
  return { user_id: input.userId, identity_display_name: input.name.trim(), normalized_name: normalizeNutritionCatalogName(input.name), aliases: [], food_state: input.foodState ?? inferCatalogFoodState(input.name),
    nutrition_basis: input.nutritionBasis, calories: input.calories, protein_g: input.proteinG, carbs_g: input.carbsG, fat_g: input.fatG,
    source: input.source ?? "user", external_id: input.externalId ?? null, match_confidence: "high", user_confirmed: true,
    verified: true, resolved_at: new Date().toISOString(), refresh_after: null };
}

export async function persistConfirmedNutritionBatch(client: CatalogClient, rows: NutritionCatalogRow[]) {
  const deduplicated = new Map<string, NutritionCatalogRow>();
  for (const row of rows) {
    if (!complete(row) || !row.user_confirmed || !row.normalized_name) continue;
    deduplicated.set(catalogRequestKey(row.normalized_name, row.food_state, row.nutrition_basis), row);
  }
  if (!deduplicated.size) return 0;
  const { resolveOrCreateFoodCatalogItemForUser } = await import("@/modules/nutrition/food-catalog");
  const payload = await Promise.all([...deduplicated.values()].map(async (row) => {
    let foodCatalogItemId = row.food_catalog_item_id ?? null;
    try {
      foodCatalogItemId = await resolveOrCreateFoodCatalogItemForUser(client, {
        userId: row.user_id, displayName: row.identity_display_name ?? row.normalized_name, providerName: row.aliases[0], foodState: row.food_state,
        identitySource: row.source, externalId: row.external_id, userConfirmed: true,
        existingFoodCatalogItemId: foodCatalogItemId,
      });
    } catch (error) {
      console.warn("Supabase could not link the food identity:", error instanceof Error ? error.message : error);
    }
    return { ...row, food_catalog_item_id: foodCatalogItemId };
  }));
  const result = await client.rpc("upsert_nutrition_catalog_items", { p_items: payload });
  if (result.error) throw new Error(result.error.message);
  return Number(result.data);
}
