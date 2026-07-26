import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveInventoryNutrition } from "@/lib/nutrition/hybrid-resolver";

const input = { name: "Arroz cocido", quantity: 100, unit: "g", category: "carbohydrate" } as const;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
describe("hybrid nutrition resolver", () => {
  it("returns USDA without requiring or calling OpenAI", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ foods: [{ fdcId: 8, description: "Rice, cooked", dataType: "Foundation" }] })).mockResolvedValueOnce(json({ fdcId: 8, description: "Rice, cooked", dataType: "Foundation", foodNutrients: [{ nutrient: { id: 1008 }, amount: 130 }, { nutrient: { id: 1003 }, amount: 2.7 }, { nutrient: { id: 1005 }, amount: 28 }, { nutrient: { id: 1004 }, amount: 0.3 }] }));
    await expect(resolveInventoryNutrition(input, { usdaApiKey: "key", openAiApiKey: "", fetchImpl })).resolves.toMatchObject({ status: "resolved", provenance: { source: "usda" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("keeps provider names and AI-first copy out of inventory UI", () => {
    const nutritionUi = readFileSync("components/inventory/InventoryNutritionAiControls.tsx", "utf8");
    const barcodeUi = readFileSync("app/inventory/BarcodeCatalogControls.tsx", "utf8");
    expect(nutritionUi).toContain("Calcular macros");
    expect(`${nutritionUi}\n${barcodeUi}`).not.toMatch(/Open Food Facts|USDA|con IA|La IA ofrece/);
  });
});
