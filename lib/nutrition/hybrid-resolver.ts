import { estimateInventoryNutritionWithOpenAi } from "@/lib/openai/inventory-nutrition";
import { lookupUsdaFood } from "@/lib/nutrition/usda";
import type { InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import type { NutritionResolution } from "@/modules/nutrition/resolution";

export async function resolveInventoryNutrition(input: InventoryNutritionAiInput, options: { usdaApiKey?: string; openAiApiKey?: string; openAiModel?: string; fetchImpl?: typeof fetch } = {}): Promise<NutritionResolution> {
  const usda = await lookupUsdaFood(input, { apiKey: options.usdaApiKey, openAiApiKey: options.openAiApiKey, openAiModel: options.openAiModel ?? process.env.OPENAI_INVENTORY_NUTRITION_MODEL, fetchImpl: options.fetchImpl });
  if (usda.status === "resolved" || usda.status === "needs-clarification") return usda;
  const apiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return usda;
  const ai = await estimateInventoryNutritionWithOpenAi(input, { apiKey, model: options.openAiModel ?? process.env.OPENAI_INVENTORY_NUTRITION_MODEL, fetchImpl: options.fetchImpl });
  if (ai.status === "success") return { status: "resolved", normalizedName: input.name, foodState: "unknown", nutritionBasis: ai.estimate.nutrition_basis, calories: ai.estimate.calories, proteinG: ai.estimate.protein_g, carbsG: ai.estimate.carbs_g, fatG: ai.estimate.fat_g, needsReview: true, provenance: { source: "ai", resolvedAt: new Date().toISOString() }, assumptions: ai.estimate.assumptions };
  if (ai.status === "needs-clarification") return ai;
  return { status: "unresolved", reason: "provider-error" };
}
