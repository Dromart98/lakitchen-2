import { describe, expect, it } from "vitest";

import { buildObservedPackageEquivalenceProposals } from "@/modules/inventory/voice-inventory-package-equivalences";

const tunaId = "123e4567-e89b-42d3-a456-426614174000";
const metadata = (changed = {}) => ({ name: "Atún", food_state: "processed" as const, package_measure_kind: "can" as const, package_count: 4, package_size: null, package_size_unit: null, total_size: 572, total_size_unit: "g" as const, ...changed });

describe("observed voice package equivalence proposals", () => {
  it("derives an individual size, label and variant on the server", () => {
    const [proposal] = buildObservedPackageEquivalenceProposals([{ food_catalog_item_id: tunaId }], [metadata({ package_count: 3, package_size: 143, package_size_unit: "g", total_size: null, total_size_unit: null })]);
    expect(proposal).toEqual({ foodCatalogItemId: tunaId, measureKind: "can", variantKey: "lata-de-143-g", displayLabel: "Lata de 143 g", canonicalQuantity: 143, canonicalUnit: "g" });
  });
  it("divides a total by the package count", () => expect(buildObservedPackageEquivalenceProposals([{ food_catalog_item_id: tunaId }], [metadata()])[0]).toMatchObject({ canonicalQuantity: 143, canonicalUnit: "g" }));
  it("requires a server identity, kind and resolvable compatible size", () => {
    expect(buildObservedPackageEquivalenceProposals([{ food_catalog_item_id: null }], [metadata()])).toEqual([]);
    expect(buildObservedPackageEquivalenceProposals([{ food_catalog_item_id: tunaId }], [metadata({ package_measure_kind: null })])).toEqual([]);
    expect(buildObservedPackageEquivalenceProposals([{ food_catalog_item_id: tunaId }], [metadata({ total_size_unit: "ml" })])).toHaveLength(1);
    expect(buildObservedPackageEquivalenceProposals([{ food_catalog_item_id: tunaId }], [metadata({ package_size: 143, package_size_unit: "g", total_size_unit: "ml" })])).toEqual([]);
  });
  it("deduplicates identity, kind and variant while preserving distinct sizes deterministically", () => {
    const proposals = buildObservedPackageEquivalenceProposals(
      [{ food_catalog_item_id: tunaId }, { food_catalog_item_id: tunaId }, { food_catalog_item_id: tunaId }],
      [metadata(), metadata(), metadata({ package_count: 1, total_size: 80 })],
    );
    expect(proposals.map((proposal) => proposal.variantKey)).toEqual(["lata-de-143-g", "lata-de-80-g"]);
  });
});
