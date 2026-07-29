import type { OpenFoodFactsPackage } from "@/lib/nutrition/open-food-facts";
import { validateBarcodeInput } from "@/modules/barcodes/barcode";

export type BarcodePackageEquivalenceProposal = {
  foodCatalogItemId: string;
  measureKind: "package";
  variantKey: string;
  displayLabel: string;
  canonicalQuantity: number;
  canonicalUnit: "g" | "ml";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatQuantity(quantity: number): string {
  const value = String(quantity);
  if (!/[eE]/.test(value)) return value.replace(".", ",");
  const [coefficient, exponentText] = value.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const [integer, fraction = ""] = coefficient.replace("-", "").split(".");
  const digits = integer + fraction;
  const decimalPosition = integer.length + exponent;
  const expanded = decimalPosition <= 0
    ? `0.${"0".repeat(-decimalPosition)}${digits}`
    : decimalPosition >= digits.length
      ? `${digits}${"0".repeat(decimalPosition - digits.length)}`
      : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  return `${coefficient.startsWith("-") ? "-" : ""}${expanded}`.replace(".", ",");
}

export function buildBarcodePackageEquivalenceProposal(input: {
  barcode: string;
  foodCatalogItemId: string | null;
  package: OpenFoodFactsPackage | null;
}): BarcodePackageEquivalenceProposal | null {
  const barcode = validateBarcodeInput(input.barcode);
  const packageData = input.package;
  if (!barcode.ok || !input.foodCatalogItemId || !UUID_PATTERN.test(input.foodCatalogItemId) || !packageData) return null;
  if (!Number.isFinite(packageData.quantity) || packageData.quantity <= 0 || !["g", "ml"].includes(packageData.unit)) return null;
  return {
    foodCatalogItemId: input.foodCatalogItemId,
    measureKind: "package",
    variantKey: `barcode-${barcode.barcode}`,
    displayLabel: `Envase de ${formatQuantity(packageData.quantity)} ${packageData.unit}`,
    canonicalQuantity: packageData.quantity,
    canonicalUnit: packageData.unit,
  };
}
