import { NextResponse } from "next/server";

import { validateBarcodeInput } from "@/modules/barcodes/barcode";
import type { InventoryCategory } from "@/modules/inventory/inventory-categories";

type InventoryUnit = "ud" | "g" | "kg" | "ml" | "l";

type OpenFoodFactsProduct = {
  product_name_es?: string;
  product_name?: string;
  generic_name_es?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  categories_tags?: string[];
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
};

type OpenFoodFactsResponse = {
  status?: number;
  product?: OpenFoodFactsProduct;
};

const CATEGORY_RULES: Array<{ category: InventoryCategory; keywords: string[] }> = [
  { category: "vegetable", keywords: ["vegetable", "verdura", "hortaliza"] },
  { category: "fruit", keywords: ["fruit", "fruta"] },
  { category: "legume", keywords: ["legume", "legumbre", "lentil", "bean", "chickpea"] },
  { category: "dairy", keywords: ["dairy", "milk", "cheese", "yogurt", "lacteo", "lácteo"] },
  { category: "beverage", keywords: ["beverage", "drink", "bebida", "water", "agua"] },
  { category: "condiment", keywords: ["condiment", "sauce", "salsa", "spice", "seasoning"] },
  { category: "fat", keywords: ["oil", "aceite", "butter", "mantequilla", "margarine"] },
  { category: "protein", keywords: ["meat", "fish", "seafood", "egg", "protein", "carne", "pescado", "huevo"] },
  { category: "carbohydrate", keywords: ["bread", "pasta", "rice", "cereal", "potato", "pan", "arroz", "patata"] },
];

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function inferCategory(tags: string[] | undefined): InventoryCategory {
  const normalizedTags = (tags ?? []).join(" ").toLocaleLowerCase("es-ES");
  return CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => normalizedTags.includes(keyword)))?.category ?? "other";
}

function inferPackage(product: OpenFoodFactsProduct): { quantity: number; unit: InventoryUnit } {
  const quantity = finiteNonNegative(product.product_quantity);
  const rawUnit = product.product_quantity_unit?.toLocaleLowerCase("es-ES").trim();

  if (quantity !== null && quantity > 0) {
    if (rawUnit === "g" || rawUnit === "kg" || rawUnit === "ml" || rawUnit === "l") {
      return { quantity, unit: rawUnit };
    }
  }

  const quantityMatch = product.quantity?.toLocaleLowerCase("es-ES").match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (quantityMatch) {
    const parsedQuantity = Number(quantityMatch[1].replace(",", "."));
    const parsedUnit = quantityMatch[2];
    if (Number.isFinite(parsedQuantity) && parsedQuantity > 0) {
      if (parsedUnit === "cl") return { quantity: parsedQuantity * 10, unit: "ml" };
      return { quantity: parsedQuantity, unit: parsedUnit as InventoryUnit };
    }
  }

  return { quantity: 1, unit: "ud" };
}

function buildName(product: OpenFoodFactsProduct): string | null {
  const baseName = product.product_name_es?.trim()
    || product.product_name?.trim()
    || product.generic_name_es?.trim()
    || product.generic_name?.trim();
  if (!baseName) return null;

  const brand = product.brands?.split(",")[0]?.trim();
  const name = brand && !baseName.toLocaleLowerCase("es-ES").includes(brand.toLocaleLowerCase("es-ES"))
    ? `${baseName} - ${brand}`
    : baseName;

  return name.slice(0, 120);
}

export async function GET(_request: Request, context: { params: Promise<{ barcode: string }> }) {
  const { barcode: rawBarcode } = await context.params;
  const validation = validateBarcodeInput(rawBarcode);

  if (!validation.ok) {
    return NextResponse.json({ status: "invalid", message: validation.message }, { status: 400 });
  }

  const fields = [
    "product_name_es",
    "product_name",
    "generic_name_es",
    "generic_name",
    "brands",
    "quantity",
    "product_quantity",
    "product_quantity_unit",
    "categories_tags",
    "nutriments",
  ].join(",");

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${validation.barcode}.json?fields=${encodeURIComponent(fields)}`,
      {
        headers: { "User-Agent": "LaKitchen/1.0 (https://lakitchenapp.com)" },
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(6_000),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ status: "error", message: "El catálogo externo no está disponible ahora mismo." }, { status: 502 });
    }

    const payload = await response.json() as OpenFoodFactsResponse;
    const product = payload.status === 1 ? payload.product : null;
    const name = product ? buildName(product) : null;

    if (!product || !name) {
      return NextResponse.json({ status: "unknown", barcode: validation.barcode });
    }

    const packageData = inferPackage(product);
    const nutriments = product.nutriments ?? {};

    return NextResponse.json({
      status: "found",
      source: "open-food-facts",
      product: {
        barcode: validation.barcode,
        name,
        default_quantity: packageData.quantity,
        default_unit: packageData.unit,
        default_location: null,
        category: inferCategory(product.categories_tags),
        nutrition_basis: "per_100g",
        calories: finiteNonNegative(nutriments["energy-kcal_100g"]),
        protein_g: finiteNonNegative(nutriments.proteins_100g),
        carbs_g: finiteNonNegative(nutriments.carbohydrates_100g),
        fat_g: finiteNonNegative(nutriments.fat_100g),
      },
    });
  } catch (error) {
    console.warn("Open Food Facts lookup failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ status: "error", message: "No se pudo consultar el catálogo externo. Inténtalo de nuevo." }, { status: 502 });
  }
}
