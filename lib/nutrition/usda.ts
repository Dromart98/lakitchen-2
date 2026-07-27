import { z } from "zod";

import { getInventoryNutritionFoodStateExpectation, type InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import { isCompleteNutrition, type NutritionResolution } from "@/modules/nutrition/resolution";

// Official search/detail contract and authentication: https://fdc.nal.usda.gov/api-guide/
const baseUrl = "https://api.nal.usda.gov/fdc/v1";
const timeoutMs = 7_000;
const allowedDataTypes = ["Foundation", "SR Legacy"] as const;
const foodSchema = z.object({ fdcId: z.number().int().positive(), description: z.string().min(1), dataType: z.string() }).passthrough();
const searchSchema = z.object({ foods: z.array(foodSchema).max(50) }).passthrough();
const detailSchema = z.object({
  fdcId: z.number().int().positive(), description: z.string().min(1), dataType: z.string(),
  foodNutrients: z.array(z.object({ nutrient: z.object({ id: z.number().int() }).passthrough(), amount: z.number().finite().nonnegative().optional() }).passthrough()),
}).passthrough();

const translations: Array<[RegExp, string]> = [
  [/pechuga de pollo/giu, "chicken breast"], [/pollo/giu, "chicken"], [/arroz/giu, "rice"],
  [/cruda?|sin cocinar/giu, "raw"], [/cocida?|hervida?/giu, "cooked"], [/queso/giu, "cheese"],
];
function toSearchQuery(name: string) { return translations.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), name).replace(/\s+/g, " ").trim(); }
function words(value: string) { return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2)); }

type UsdaNutrient = z.infer<typeof detailSchema>["foodNutrients"][number];

export function getUsdaEnergyKcal(foodNutrients: UsdaNutrient[]): number | undefined {
  const amount = (id: number) => foodNutrients.find((item) => item.nutrient.id === id)?.amount;
  // USDA Foundation exposes specific-factor energy (2048) and general-factor
  // energy (2047). Prefer the more specific calculation, then general, while
  // retaining 1008 for SR Legacy and compatible historical records. Never sum.
  return amount(2048) ?? amount(2047) ?? amount(1008);
}

export function selectUsdaCandidate(input: InventoryNutritionAiInput, candidates: z.infer<typeof foodSchema>[]) {
  if (/^\s*(queso|cheese)\s*$/iu.test(input.name)) return null;
  const expected = getInventoryNutritionFoodStateExpectation(input.name)?.state ?? null;
  const queryWords = words(toSearchQuery(input.name));
  const scored = candidates
    .filter((candidate) => allowedDataTypes.includes(candidate.dataType as typeof allowedDataTypes[number]))
    .map((candidate) => {
      const description = candidate.description.toLowerCase();
      const stateConflict = expected === "raw" ? /cooked|roasted|fried|grilled/.test(description) : expected === "cooked" ? /\braw\b/.test(description) : false;
      const stateMatch = expected === "raw" ? /\braw\b/.test(description) : expected === "cooked" ? /cooked|boiled/.test(description) : true;
      const overlap = [...queryWords].filter((word) => description.includes(word)).length;
      return { candidate, score: overlap * 3 + (stateMatch ? 4 : 0), stateConflict };
    }).filter((entry) => !entry.stateConflict && entry.score >= 7)
    .sort((a, b) => b.score - a.score);
  if (!scored[0] || (scored[1] && scored[0].score === scored[1].score)) return null;
  return scored[0].candidate;
}

export async function lookupUsdaFood(input: InventoryNutritionAiInput, options: { apiKey?: string; fetchImpl?: typeof fetch } = {}): Promise<NutritionResolution> {
  const apiKey = options.apiKey ?? process.env.USDA_FDC_API_KEY;
  if (!apiKey) return { status: "unresolved", reason: "not-configured" };
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const search = await fetchImpl(`${baseUrl}/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: toSearchQuery(input.name), dataType: [...allowedDataTypes], pageSize: 12 }), signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
    });
    if (!search.ok) return { status: "unresolved", reason: "provider-error" };
    const parsedSearch = searchSchema.safeParse(await search.json());
    if (!parsedSearch.success) return { status: "unresolved", reason: "provider-error" };
    const selected = selectUsdaCandidate(input, parsedSearch.data.foods);
    if (!selected) return { status: "needs-clarification", message: "No hemos encontrado una coincidencia suficientemente clara. Añade más detalles sobre el alimento y su estado." };
    const detail = await fetchImpl(`${baseUrl}/food/${selected.fdcId}?api_key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!detail.ok) return { status: "unresolved", reason: "provider-error" };
    const parsedDetail = detailSchema.safeParse(await detail.json());
    if (!parsedDetail.success || !allowedDataTypes.includes(parsedDetail.data.dataType as typeof allowedDataTypes[number])) return { status: "unresolved", reason: "provider-error" };
    const nutrient = (id: number) => parsedDetail.data.foodNutrients.find((item) => item.nutrient.id === id)?.amount;
    const values = { calories: getUsdaEnergyKcal(parsedDetail.data.foodNutrients), proteinG: nutrient(1003), carbsG: nutrient(1005), fatG: nutrient(1004) };
    if (!isCompleteNutrition(values)) return { status: "unresolved", reason: "provider-error" };
    return { status: "resolved", normalizedName: parsedDetail.data.description.slice(0, 120), foodState: getInventoryNutritionFoodStateExpectation(input.name)?.state ?? "unknown", nutritionBasis: "per_100g", calories: values.calories!, proteinG: values.proteinG!, carbsG: values.carbsG!, fatG: values.fatG!, needsReview: true, provenance: { source: "usda", externalId: String(selected.fdcId), resolvedAt: new Date().toISOString() }, assumptions: "Valores orientativos por 100 g; revisa que el alimento y su estado sean correctos." };
  } catch { return { status: "unresolved", reason: "provider-error" }; }
}
