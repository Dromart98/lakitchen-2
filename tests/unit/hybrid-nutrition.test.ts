import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveInventoryNutrition } from "@/lib/nutrition/hybrid-resolver";

const input = { name: "Arroz cocido", quantity: 100, unit: "g", category: "carbohydrate" } as const;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
describe("hybrid nutrition resolver", () => {
  it("returns USDA without requiring or calling OpenAI", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: [{ fdcId: 8, description: "Rice, cooked", dataType: "Foundation" }] })).mockResolvedValueOnce(json({ fdcId: 8, description: "Rice, cooked", dataType: "Foundation", foodNutrients: [{ nutrient: { id: 2047 }, amount: 130 }, { nutrient: { id: 1003 }, amount: 2.7 }, { nutrient: { id: 1005 }, amount: 28 }, { nutrient: { id: 1004 }, amount: 0.3 }] }));
    await expect(resolveInventoryNutrition(input, { usdaApiKey: "key", openAiApiKey: "", fetchImpl })).resolves.toMatchObject({ status: "resolved", provenance: { source: "usda" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("falls back to OpenAI and honors its configured model when USDA lacks compatible energy", async () => {
    const aiOutput = { status: "estimated", nutrition_basis: "per_100g", calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, confidence: "medium", food_state: "cooked", normalized_food_name: "Arroz cocido", assumptions: "Arroz cocido típico.", clarification: null };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ foods: [{ fdcId: 8, description: "Rice, cooked", dataType: "Foundation" }] }))
      .mockResolvedValueOnce(json({ fdcId: 8, description: "Rice, cooked", dataType: "Foundation", foodNutrients: [{ nutrient: { id: 1003 }, amount: 2.7 }, { nutrient: { id: 1005 }, amount: 28 }, { nutrient: { id: 1004 }, amount: 0.3 }] }))
      .mockResolvedValueOnce(json({ status: "completed", output_text: JSON.stringify(aiOutput) }));
    await expect(resolveInventoryNutrition(input, { usdaApiKey: "key", openAiApiKey: "openai", openAiModel: "configured-model", fetchImpl })).resolves.toMatchObject({ status: "resolved", provenance: { source: "ai" } });
    const aiRequest = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(aiRequest.model).toBe("configured-model");
  });
  it("keeps provider names and AI-first copy out of inventory UI", () => {
    const nutritionUi = readFileSync("components/inventory/InventoryNutritionAiControls.tsx", "utf8");
    const barcodeUi = readFileSync("app/inventory/BarcodeCatalogControls.tsx", "utf8");
    expect(nutritionUi).toContain("Calcular macros");
    expect(`${nutritionUi}\n${barcodeUi}`).not.toMatch(/Open Food Facts|USDA|con IA|La IA ofrece/);
  });
});
