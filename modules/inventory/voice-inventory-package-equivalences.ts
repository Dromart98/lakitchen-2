import type { z } from "zod";

import { resolvePackageQuantity } from "@/modules/inventory/inventory-package-quantities";
import type { VoiceInventoryBatchCatalogMetadataSchema } from "@/modules/inventory/voice-inventory-batch-save";
import { deriveFoodQuantityVariantKey } from "@/modules/units/food-quantity-equivalence";

type Metadata = z.infer<typeof VoiceInventoryBatchCatalogMetadataSchema>[number];
type ItemWithIdentity = { food_catalog_item_id?: string | null };
export type ObservedPackageEquivalenceProposal = {
  foodCatalogItemId: string;
  measureKind: "can" | "package";
  variantKey: string;
  displayLabel: string;
  canonicalQuantity: number;
  canonicalUnit: "g" | "ml";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const labels = { can: "Lata", package: "Paquete" } as const;

export function buildObservedPackageEquivalenceProposals(items: ItemWithIdentity[], metadata: Metadata[]) {
  const proposals: ObservedPackageEquivalenceProposal[] = [];
  const keys = new Set<string>();
  items.forEach((item, index) => {
    const facts = metadata[index];
    if (!facts || !item.food_catalog_item_id || !UUID.test(item.food_catalog_item_id) || !facts.package_measure_kind) return;
    const resolved = resolvePackageQuantity(facts);
    if (!resolved || !Number.isFinite(resolved.derived_unit_size) || resolved.derived_unit_size <= 0) return;
    const displayLabel = `${labels[facts.package_measure_kind]} de ${resolved.derived_unit_size} ${resolved.derived_unit_size_unit}`;
    const variantKey = deriveFoodQuantityVariantKey(displayLabel);
    if (!variantKey) return;
    const key = `${item.food_catalog_item_id}:${facts.package_measure_kind}:${variantKey}`;
    if (keys.has(key)) return;
    keys.add(key);
    proposals.push({ foodCatalogItemId: item.food_catalog_item_id, measureKind: facts.package_measure_kind, variantKey, displayLabel, canonicalQuantity: resolved.derived_unit_size, canonicalUnit: resolved.derived_unit_size_unit });
  });
  return proposals.sort((a, b) => `${a.foodCatalogItemId}:${a.measureKind}:${a.variantKey}`.localeCompare(`${b.foodCatalogItemId}:${b.measureKind}:${b.variantKey}`));
}
