import { z } from "zod";

import { validateBarcodeInput } from "@/modules/barcodes/barcode";
import { isCompleteNutrition, type NutritionResolution } from "@/modules/nutrition/resolution";

// Current product-read contract: https://openfoodfacts.github.io/openfoodfacts-server/api/
const endpoint = "https://world.openfoodfacts.org/api/v2/product";
const timeoutMs = 6_000;
const fields = "code,product_name_es,product_name,nutrition_data_per,nutriments";

const payloadSchema = z.object({
  status: z.number().optional(),
  product: z.object({
    code: z.string().optional(),
    product_name_es: z.string().optional(),
    product_name: z.string().optional(),
    nutrition_data_per: z.enum(["100g", "100ml"]).optional(),
    nutriments: z.object({
      "energy-kcal_100g": z.number().finite().nonnegative().optional(),
      "energy-kcal_100ml": z.number().finite().nonnegative().optional(),
      proteins_100g: z.number().finite().nonnegative().optional(),
      proteins_100ml: z.number().finite().nonnegative().optional(),
      carbohydrates_100g: z.number().finite().nonnegative().optional(),
      carbohydrates_100ml: z.number().finite().nonnegative().optional(),
      fat_100g: z.number().finite().nonnegative().optional(),
      fat_100ml: z.number().finite().nonnegative().optional(),
    }).passthrough(),
  }).optional(),
}).passthrough();

export async function lookupOpenFoodFactsProduct(rawBarcode: string, options: { fetchImpl?: typeof fetch } = {}): Promise<NutritionResolution> {
  const validation = validateBarcodeInput(rawBarcode);
  if (!validation.ok) return { status: "unresolved", reason: "not-found" };

  try {
    const response = await (options.fetchImpl ?? fetch)(`${endpoint}/${validation.barcode}.json?fields=${encodeURIComponent(fields)}`, {
      headers: { "User-Agent": "LaKitchenapp/1.1 (https://lakitchenapp.com)" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return { status: "unresolved", reason: "not-found" };
    if (!response.ok) return { status: "unresolved", reason: "provider-error" };
    const parsed = payloadSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) return { status: "unresolved", reason: "not-found" };

    const product = parsed.data.product;
    const name = (product.product_name_es || product.product_name || "").trim();
    const suffix = product.nutrition_data_per === "100ml" ? "100ml" : product.nutrition_data_per === "100g" ? "100g" : null;
    if (!name || !suffix) return { status: "unresolved", reason: "not-found" };
    const values = {
      calories: product.nutriments[`energy-kcal_${suffix}`],
      proteinG: product.nutriments[`proteins_${suffix}`],
      carbsG: product.nutriments[`carbohydrates_${suffix}`],
      fatG: product.nutriments[`fat_${suffix}`],
    };
    if (!isCompleteNutrition(values)) return { status: "unresolved", reason: "not-found" };

    return {
      status: "resolved", normalizedName: name.slice(0, 120), foodState: "processed",
      nutritionBasis: suffix === "100ml" ? "per_100ml" : "per_100g",
      calories: values.calories!, proteinG: values.proteinG!, carbsG: values.carbsG!, fatG: values.fatG!,
      needsReview: true, provenance: { source: "open-food-facts", externalId: validation.barcode, resolvedAt: new Date().toISOString() },
      assumptions: "Comprueba que los valores coinciden con la etiqueta del envase.",
    };
  } catch {
    return { status: "unresolved", reason: "provider-error" };
  }
}
