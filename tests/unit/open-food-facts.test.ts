import { describe, expect, it, vi } from "vitest";
import { lookupOpenFoodFactsProduct } from "@/lib/nutrition/open-food-facts";

const barcode = "4006381333931";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const macros = { "energy-kcal_100g": 62.5, proteins_100g: 3.2, carbohydrates_100g: 4.7, fat_100g: 3.6 };
const payload = (product: Record<string, unknown>) => ({ status: 1, product: { product_name: "Producto", nutrition_data_per: "100g", nutriments: macros, ...product } });

describe("Open Food Facts product client", () => {
  it("maps a solid 500 g package independently from its per-100g nutrition", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_quantity: 500, product_quantity_unit: "g" }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 500, unit: "g" }, nutrition: { basis: "per_100g", calories: 62.5 } } });
  });

  it("uses normalized _100g fields as per 100 ml when package evidence is volumetric", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(payload({ product_name: "Leche", product_quantity: 1000, product_quantity_unit: "ml" })));
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: fetchImpl as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 1000, unit: "ml" }, nutrition: { basis: "per_100ml", proteinG: 3.2 } } });
    expect(fetchImpl.mock.calls[0][0]).toContain("product_quantity%2Cproduct_quantity_unit%2Cquantity%2Cnutriments");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ "User-Agent": expect.stringContaining("LaKitchenapp") });
  });

  it("keeps a normalized pack total rather than parsing the display string", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_quantity: 450, product_quantity_unit: "g", quantity: "3 x 150 g" }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 450, unit: "g" } } });
  });

  it("conservatively normalizes a simple display quantity when normalized package fields are absent", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ quantity: "1 l" }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 1000, unit: "ml" }, nutrition: { basis: "per_100ml" } } });
  });

  it("keeps known product metadata but no nutrition when quantity/base evidence is absent", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_name: "Producto sin tamaño" }))) as typeof fetch });
    expect(result).toEqual({ status: "found", product: { barcode, name: "Producto sin tamaño", package: null, nutrition: null } });
  });

  it("does not treat serving values as normalized nutrition when _100g macros are insufficient", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ nutrition_data_per: "serving", product_quantity: 250, product_quantity_unit: "g", nutriments: { proteins_100g: 3 } }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 250, unit: "g" }, nutrition: null } });
  });

  it.each([
    ["incomplete", payload({ product_quantity: 500, product_quantity_unit: "g", nutriments: { "energy-kcal_100g": 60 } }), 200, "found"],
    ["negative", payload({ product_quantity: 500, product_quantity_unit: "g", nutriments: { ...macros, fat_100g: -1 } }), 200, "found"],
    ["not found", { status: 0 }, 200, "not-found"],
    ["404", {}, 404, "not-found"],
    ["429", {}, 429, "provider-error"],
  ])("handles %s responses", async (_case, body, status, expectedStatus) => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(body, status)) as typeof fetch });
    expect(result.status).toBe(expectedStatus);
    if ((_case === "incomplete" || _case === "negative") && result.status === "found") expect(result.product.nutrition).toBeNull();
  });

  it("supplies an explicit timeout signal and maps aborts to provider failure", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("Timed out", "AbortError");
    });
    await expect(lookupOpenFoodFactsProduct(barcode, { fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual({ status: "provider-error" });
  });
});
