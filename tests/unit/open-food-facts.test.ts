import { describe, expect, it, vi } from "vitest";
import { lookupOpenFoodFactsProduct } from "@/lib/nutrition/open-food-facts";

const barcode = "4006381333931";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const product = { status: 1, product: { product_name_es: "Leche entera", nutrition_data_per: "100ml", nutriments: { "energy-kcal_100ml": 62.5, proteins_100ml: 3.2, carbohydrates_100ml: 4.7, fat_100ml: 3.6 } } };

describe("Open Food Facts client", () => {
  it("requests only server fields with an identifiable User-Agent and preserves decimals/base", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(product));
    await expect(lookupOpenFoodFactsProduct(barcode, { fetchImpl: fetchImpl as typeof fetch })).resolves.toMatchObject({ status: "resolved", nutritionBasis: "per_100ml", proteinG: 3.2 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toContain("/api/v2/product/4006381333931.json?fields=");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ "User-Agent": expect.stringContaining("LaKitchenapp") });
  });
  it.each([[{ status: 0 }, 200], [product, 404], [product, 429], [{ status: 1, product: { ...product.product, nutriments: { ...product.product.nutriments, fat_100ml: -1 } } }, 200], [{ status: 1, product: { ...product.product, nutriments: { "energy-kcal_100ml": 60 } } }, 200]])("rejects missing, unavailable, malformed or incomplete data", async (body, status) => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(body, status)) as typeof fetch });
    expect(result.status).toBe("unresolved");
  });
  it("contains an explicit timeout signal", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { expect(init?.signal).toBeInstanceOf(AbortSignal); return response(product); });
    await lookupOpenFoodFactsProduct(barcode, { fetchImpl: fetchImpl as typeof fetch });
  });
});
