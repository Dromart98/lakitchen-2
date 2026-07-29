import { describe, expect, it } from "vitest";
import { FOOD_QUANTITY_MEASURE_KIND_LABELS, deriveFoodQuantityVariantKey } from "@/modules/units/food-quantity-equivalence";
import { mergeCandidateFoodIdentityIds, toFoodIdentityOption, validateEquivalenceFields } from "@/modules/units/food-quantity-equivalence-management";

const food1 = "00000000-0000-4000-8000-000000000001";
const food2 = "00000000-0000-4000-8000-000000000002";

describe("food quantity equivalence management helpers", () => {
  it("uses the required visible measure labels", () => {
    expect(FOOD_QUANTITY_MEASURE_KIND_LABELS).toEqual({ unit: "Unidad", tablespoon: "Cucharada", teaspoon: "Cucharadita", can: "Lata", package: "Paquete", serving: "Ración" });
  });

  it("derives stable server-side variant keys", () => {
    expect(deriveFoodQuantityVariantKey("  Cucharada SÓPER grande  ")).toBe("cucharada-soper-grande");
    expect(deriveFoodQuantityVariantKey(`Lata ${"grande ".repeat(20)}`)?.length).toBeLessThanOrEqual(80);
    expect(deriveFoodQuantityVariantKey(" ¿¡—!? ")).toBeNull();
  });

  it("unites inventory and saved-equivalence identities without duplicates or nulls", () => {
    expect(mergeCandidateFoodIdentityIds([{ food_catalog_item_id: food1 }, { food_catalog_item_id: food1 }, { food_catalog_item_id: null }], [food1, food2])).toEqual([food1, food2]);
  });

  it("sanitizes identity options and retains only the visible name", () => {
    expect(toFoodIdentityOption({ id: food1, display_name: " Tomate ", normalized_name: "tomate" })).toEqual({ id: food1, displayName: "Tomate" });
    expect(toFoodIdentityOption({ id: "wrong", display_name: "Tomate" })).toBeNull();
  });

  it("validates supported form values and rejects blank quantities", () => {
    const form = new FormData();
    form.set("food_catalog_item_id", food1); form.set("measure_kind", "can"); form.set("display_label", " Lata de 143 g "); form.set("canonical_quantity", "143"); form.set("canonical_unit", "g");
    expect(validateEquivalenceFields(form)).toEqual({ foodCatalogItemId: food1, measureKind: "can", displayLabel: "Lata de 143 g", canonicalQuantity: 143, canonicalUnit: "g" });
    form.set("canonical_quantity", ""); expect(validateEquivalenceFields(form)).toBeNull();
  });
});
