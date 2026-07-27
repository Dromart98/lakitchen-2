import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { lookupOpenFoodFactsProduct } from "@/lib/nutrition/open-food-facts";

const barcode = "4006381333931";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const nutrients = {
  "energy-kcal": { value: 62.5, unit: "kcal", source: "packaging" },
  proteins: { value: 3.2, unit: "g", source: "packaging" },
  carbohydrates: { value: 4.7, unit: "g", source: "packaging" },
  fat: { value: 3.6, unit: "g", source: "packaging" },
};
const payload = (product: Record<string, unknown>, per: "100g" | "100ml" | "serving" = "100g") => ({
  status: "success",
  result: { id: "product_found" },
  errors: [],
  product: {
    code: barcode,
    schema_version: 999,
    product_name: "Producto",
    nutrition: { aggregated_set: { preparation: "as_sold", per, nutrients: structuredClone(nutrients) } },
    ...product,
  },
});

describe("Open Food Facts v3 product client", () => {
  it("uses Product Read v3, selected fields and an identifiable User-Agent", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(payload({ product_quantity: "500", product_quantity_unit: "g" })));
    await lookupOpenFoodFactsProduct(barcode, { fetchImpl: fetchImpl as typeof fetch });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://world.openfoodfacts.org/api/v3/product/${barcode}?fields=code%2Cproduct_name_es%2Cproduct_name%2Cproduct_quantity%2Cproduct_quantity_unit%2Cquantity%2Cnutrition`);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ headers: { "User-Agent": expect.stringContaining("LaKitchenapp") }, cache: "no-store", signal: expect.any(AbortSignal) });
  });

  it("maps a solid 500 g package independently from its per-100g nutrition", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_quantity: "500", product_quantity_unit: "g" }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 500, unit: "g" }, nutrition: { basis: "per_100g", calories: 62.5 } } });
  });

  it("uses the v3 aggregated per value for a 1000 ml liquid without name inference", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_name: "Producto líquido", product_quantity: "1000", product_quantity_unit: "ml" }, "100ml"))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 1000, unit: "ml" }, nutrition: { basis: "per_100ml", proteinG: 3.2 } } });
  });

  it("keeps the normalized 450 g pack total instead of deriving it from the nutrition basis", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_quantity: "450", product_quantity_unit: "g", quantity: "3 x 150 g" }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 450, unit: "g" }, nutrition: { basis: "per_100g" } } });
  });

  it("keeps a found product and package when v3 nutrition is incomplete", async () => {
    const body = payload({ product_quantity: "250", product_quantity_unit: "g" });
    body.product.nutrition.aggregated_set.nutrients = { proteins: { value: 3, unit: "g", source: "packaging" } } as typeof nutrients;
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(body)) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { package: { quantity: 250, unit: "g" }, nutrition: null } });
  });

  it("does not invent package quantity when it is absent", async () => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_name: "Producto sin tamaño" }))) as typeof fetch });
    expect(result).toMatchObject({ status: "found", product: { name: "Producto sin tamaño", package: null, nutrition: { basis: "per_100g" } } });
    if (result.status === "found") expect(result.product.package?.quantity).not.toBe(100);
  });

  it("rejects serving-only and negative nutrition without discarding known product metadata", async () => {
    const serving = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(payload({ product_quantity: "250", product_quantity_unit: "g" }, "serving"))) as typeof fetch });
    expect(serving).toMatchObject({ status: "found", product: { nutrition: null } });
    const negativeBody = payload({ product_quantity: "250", product_quantity_unit: "g" });
    negativeBody.product.nutrition.aggregated_set.nutrients.fat.value = -1;
    const negative = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(negativeBody)) as typeof fetch });
    expect(negative).toMatchObject({ status: "found", product: { nutrition: null } });
  });

  it.each([[404, "not-found"], [429, "provider-error"], [500, "provider-error"], [503, "provider-error"]] as const)("maps HTTP %s to %s", async (httpStatus, expectedStatus) => {
    const result = await lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response({}, httpStatus)) as typeof fetch });
    expect(result.status).toBe(expectedStatus);
  });

  it.each([
    { status: 1, product: {} },
    { status: "unknown", product: {} },
    { status: "success" },
    { status: "failure", result: { id: "request_failed" }, errors: [] },
  ])("maps malformed or unsuccessful v3 payload %# to provider-error", async (body) => {
    await expect(lookupOpenFoodFactsProduct(barcode, { fetchImpl: vi.fn(async () => response(body)) as typeof fetch })).resolves.toEqual({ status: "provider-error" });
  });

  it("maps timeout aborts to provider-error", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("Timed out", "AbortError");
    });
    await expect(lookupOpenFoodFactsProduct(barcode, { fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual({ status: "provider-error" });
  });

  it("keeps the browser component provider-agnostic and free of external fetches", () => {
    const component = readFileSync("app/inventory/BarcodeCatalogControls.tsx", "utf8");
    expect(component).not.toMatch(/openfoodfacts|world\.openfoodfacts|api\/v3/i);
    expect(component).not.toMatch(/fetch\s*\(/);
  });
});
