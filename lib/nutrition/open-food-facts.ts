import { z } from "zod";

import { validateBarcodeInput } from "@/modules/barcodes/barcode";
import type { InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import { isCompleteNutrition } from "@/modules/nutrition/resolution";

// Product read API v2: https://openfoodfacts.github.io/openfoodfacts-server/api/ref-v2/
const endpoint = "https://world.openfoodfacts.org/api/v2/product";
const timeoutMs = 6_000;
const fields = "code,product_name_es,product_name,nutrition_data_per,product_quantity,product_quantity_unit,quantity,nutriments";

const payloadSchema = z.object({
  status: z.number().optional(),
  product: z.object({
    code: z.string().nullish(),
    product_name_es: z.string().nullish(),
    product_name: z.string().nullish(),
    nutrition_data_per: z.enum(["100g", "serving"]).nullish(),
    product_quantity: z.union([z.number().finite(), z.string()]).nullish(),
    product_quantity_unit: z.string().nullish(),
    quantity: z.string().nullish(),
    nutriments: z.object({
      "energy-kcal_100g": z.number().finite().optional(),
      proteins_100g: z.number().finite().optional(),
      carbohydrates_100g: z.number().finite().optional(),
      fat_100g: z.number().finite().optional(),
    }).passthrough().nullish(),
  }).passthrough().optional(),
}).passthrough();

export type OpenFoodFactsPackage = { quantity: number; unit: "g" | "ml" };
export type OpenFoodFactsNutrition = {
  basis: InventoryNutritionBasis;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type OpenFoodFactsProductResult =
  | { status: "found"; product: { barcode: string; name: string; package: OpenFoodFactsPackage | null; nutrition: OpenFoodFactsNutrition | null } }
  | { status: "not-found" }
  | { status: "provider-error" };

function normalizedPackage(quantity: unknown, unit: unknown): OpenFoodFactsPackage | null {
  const parsedQuantity = typeof quantity === "number" ? quantity : typeof quantity === "string" && quantity.trim() ? Number(quantity) : Number.NaN;
  const normalizedUnit = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return null;
  if (normalizedUnit === "g" || normalizedUnit === "ml") return { quantity: parsedQuantity, unit: normalizedUnit };
  return null;
}

function displayedPackage(quantity: string | null | undefined): OpenFoodFactsPackage | null {
  if (!quantity) return null;
  const match = quantity.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l)$/u);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2];
  if (unit === "kg") return { quantity: value * 1_000, unit: "g" };
  if (unit === "l") return { quantity: value * 1_000, unit: "ml" };
  if (unit === "cl") return { quantity: value * 10, unit: "ml" };
  return { quantity: value, unit: unit as "g" | "ml" };
}

function extractNutrition(product: z.infer<typeof payloadSchema>["product"], packageData: OpenFoodFactsPackage | null): OpenFoodFactsNutrition | null {
  if (!product?.nutriments || !packageData) return null;
  const values = {
    calories: product.nutriments["energy-kcal_100g"],
    proteinG: product.nutriments.proteins_100g,
    carbsG: product.nutriments.carbohydrates_100g,
    fatG: product.nutriments.fat_100g,
  };
  if (!isCompleteNutrition(values)) return null;
  return {
    basis: packageData.unit === "ml" ? "per_100ml" : "per_100g",
    calories: values.calories!, proteinG: values.proteinG!, carbsG: values.carbsG!, fatG: values.fatG!,
  };
}

export async function lookupOpenFoodFactsProduct(rawBarcode: string, options: { fetchImpl?: typeof fetch } = {}): Promise<OpenFoodFactsProductResult> {
  const validation = validateBarcodeInput(rawBarcode);
  if (!validation.ok) return { status: "not-found" };
  try {
    const response = await (options.fetchImpl ?? fetch)(`${endpoint}/${validation.barcode}.json?fields=${encodeURIComponent(fields)}`, {
      headers: { "User-Agent": "LaKitchenapp/1.1 (https://lakitchenapp.com)" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "provider-error" };
    const parsed = payloadSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "provider-error" };
    if (parsed.data.status !== 1 || !parsed.data.product) return { status: "not-found" };
    const product = parsed.data.product;
    const name = (product.product_name_es || product.product_name || "").trim();
    if (!name) return { status: "not-found" };
    const packageData = normalizedPackage(product.product_quantity, product.product_quantity_unit) ?? displayedPackage(product.quantity);
    return {
      status: "found",
      product: { barcode: validation.barcode, name: name.slice(0, 120), package: packageData, nutrition: extractNutrition(product, packageData) },
    };
  } catch {
    return { status: "provider-error" };
  }
}
