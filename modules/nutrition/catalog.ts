import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
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
  id?: string; user_id: string; normalized_name: string; aliases: string[];
  food_state: NutritionCatalogFoodState; nutrition_basis: InventoryNutritionBasis;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  source: NutritionSource; external_id: string | null; match_confidence: "low" | "medium" | "high";
  user_confirmed: boolean; verified: boolean; resolved_at: string; updated_at?: string;
};

const SOURCE_PRIORITY: Record<NutritionSource, number> = { ai: 1, "open-food-facts": 2, usda: 3, "barcode-memory": 4, user: 5 };

export function normalizeNutritionCatalogName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function inferCatalogFoodState(name: string): NutritionCatalogFoodState {
  const value = normalizeNutritionCatalogName(name);
  if (/(^| )(crudo|cruda|crudos|crudas)( |$)/.test(value)) return "raw";
  if (/(^| )(cocido|cocida|cocidos|cocidas)( |$)/.test(value)) return "cooked";
  if (/(^| )(escurrido|escurrida)( |$)/.test(value)) return "drained";
  if (/(^| )(congelado|congelada)( |$)/.test(value)) return "frozen";
  if (/(^| )(procesado|procesada)( |$)/.test(value)) return "processed";
  return "unknown";
}

export function catalogBasisForUnit(unit: string): InventoryNutritionBasis {
  return unit === "ud" ? "per_unit" : unit === "ml" || unit === "l" ? "per_100ml" : "per_100g";
}

export function isCatalogRowFresh(row: Pick<NutritionCatalogRow, "source" | "user_confirmed" | "resolved_at">, now = Date.now()) {
  if (row.user_confirmed) return true;
  const resolvedAt = Date.parse(row.resolved_at);
  return Number.isFinite(resolvedAt) && now - resolvedAt <= NUTRITION_CATALOG_FRESHNESS_MS[row.source];
}

export function shouldReplaceCatalogRow(existing: NutritionCatalogRow, incoming: NutritionCatalogRow) {
  if (existing.user_confirmed && !incoming.user_confirmed) return false;
  if (incoming.user_confirmed) return true;
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
const CATALOG_COLUMNS = "id,user_id,normalized_name,aliases,food_state,nutrition_basis,calories,protein_g,carbs_g,fat_g,source,external_id,match_confidence,user_confirmed,verified,resolved_at,updated_at";

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
  const query = client.from("nutrition_catalog_items").select(CATALOG_COLUMNS)
    .eq("user_id", incoming.user_id).eq("normalized_name", incoming.normalized_name)
    .eq("food_state", incoming.food_state).eq("nutrition_basis", incoming.nutrition_basis).maybeSingle();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (data && !shouldReplaceCatalogRow(data as NutritionCatalogRow, incoming)) return false;
  const payload = { ...incoming, aliases: [...new Set(incoming.aliases.map(normalizeNutritionCatalogName).filter(Boolean))] };
  const result = await client.from("nutrition_catalog_items").upsert(payload, { onConflict: "user_id,normalized_name,food_state,nutrition_basis" });
  if (result.error) throw new Error(result.error.message);
  return true;
}

export function catalogRowFromResolution(userId: string, resolution: ResolvedNutrition): NutritionCatalogRow {
  return { user_id: userId, normalized_name: normalizeNutritionCatalogName(resolution.normalizedName), aliases: [],
    food_state: resolution.foodState, nutrition_basis: resolution.nutritionBasis, calories: resolution.calories,
    protein_g: resolution.proteinG, carbs_g: resolution.carbsG, fat_g: resolution.fatG,
    source: resolution.provenance.source, external_id: resolution.provenance.externalId ?? null,
    match_confidence: resolution.needsReview ? "medium" : "high", user_confirmed: false,
    verified: resolution.provenance.source === "usda" || resolution.provenance.source === "open-food-facts",
    resolved_at: resolution.provenance.resolvedAt };
}

export function confirmedCatalogRow(input: { userId: string; name: string; unit: string; nutritionBasis: InventoryNutritionBasis; calories: number; proteinG: number; carbsG: number; fatG: number; source?: "user" | "barcode-memory"; externalId?: string | null }): NutritionCatalogRow {
  return { user_id: input.userId, normalized_name: normalizeNutritionCatalogName(input.name), aliases: [], food_state: inferCatalogFoodState(input.name),
    nutrition_basis: input.nutritionBasis, calories: input.calories, protein_g: input.proteinG, carbs_g: input.carbsG, fat_g: input.fatG,
    source: input.source ?? "user", external_id: input.externalId ?? null, match_confidence: "high", user_confirmed: true,
    verified: true, resolved_at: new Date().toISOString() };
}

export async function persistConfirmedNutritionBatch(client: CatalogClient, rows: NutritionCatalogRow[]) {
  const deduplicated = new Map<string, NutritionCatalogRow>();
  for (const row of rows) {
    if (!complete(row) || !row.user_confirmed || !row.normalized_name) continue;
    deduplicated.set(catalogRequestKey(row.normalized_name, row.food_state, row.nutrition_basis), row);
  }
  if (!deduplicated.size) return 0;
  const result = await client.from("nutrition_catalog_items").upsert([...deduplicated.values()], {
    onConflict: "user_id,normalized_name,food_state,nutrition_basis",
  });
  if (result.error) throw new Error(result.error.message);
  return deduplicated.size;
}
