import { describe, expect, it } from "vitest";

import { buildBarcodePackageEquivalenceProposal } from "@/modules/inventory/barcode-package-equivalence";

const foodCatalogItemId = "123e4567-e89b-42d3-a456-426614174000";
const barcode = "4006381333931";

describe("barcode package equivalence proposals", () => {
  it("builds a package proposal exclusively from the server package", () => {
    expect(buildBarcodePackageEquivalenceProposal({ barcode, foodCatalogItemId, package: { quantity: 143, unit: "g" } })).toEqual({
      foodCatalogItemId,
      measureKind: "package",
      variantKey: `barcode-${barcode}`,
      displayLabel: "Envase de 143 g",
      canonicalQuantity: 143,
      canonicalUnit: "g",
    });
  });

  it("supports canonical ml and preserves useful decimal precision", () => {
    expect(buildBarcodePackageEquivalenceProposal({ barcode, foodCatalogItemId, package: { quantity: 500.25, unit: "ml" } })).toMatchObject({
      displayLabel: "Envase de 500,25 ml",
      canonicalQuantity: 500.25,
      canonicalUnit: "ml",
    });
  });

  it("keeps stable variants per barcode regardless of package changes", () => {
    const first = buildBarcodePackageEquivalenceProposal({ barcode, foodCatalogItemId, package: { quantity: 143, unit: "g" } });
    const changed = buildBarcodePackageEquivalenceProposal({ barcode, foodCatalogItemId, package: { quantity: 150, unit: "g" } });
    const other = buildBarcodePackageEquivalenceProposal({ barcode: "5449000000996", foodCatalogItemId, package: { quantity: 143, unit: "g" } });
    expect(first?.variantKey).toBe(changed?.variantKey);
    expect(other?.variantKey).not.toBe(first?.variantKey);
  });

  it.each([
    ["missing identity", { barcode, foodCatalogItemId: null, package: { quantity: 143, unit: "g" as const } }],
    ["missing package", { barcode, foodCatalogItemId, package: null }],
    ["invalid barcode", { barcode: "123", foodCatalogItemId, package: { quantity: 143, unit: "g" as const } }],
    ["non-positive package", { barcode, foodCatalogItemId, package: { quantity: 0, unit: "g" as const } }],
    ["non-finite package", { barcode, foodCatalogItemId, package: { quantity: Number.POSITIVE_INFINITY, unit: "ml" as const } }],
  ])("rejects %s", (_label, input) => {
    expect(buildBarcodePackageEquivalenceProposal(input)).toBeNull();
  });
});
