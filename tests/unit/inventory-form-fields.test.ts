import { describe, expect, it } from "vitest";

import { INVENTORY_ADD_FORM_FIELD_IDS, INVENTORY_BARCODE_AUTOFILL_FIELD_IDS } from "@/modules/inventory/inventory-form-fields";

describe("inventory add form field ids", () => {
  it("keeps every add form field id unique", () => {
    const fieldIds = Object.values(INVENTORY_ADD_FORM_FIELD_IDS);

    expect(new Set(fieldIds).size).toBe(fieldIds.length);
  });

  it("exposes the exact nutrition field ids used by the add form", () => {
    expect({
      nutritionBasis: INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis,
      calories: INVENTORY_ADD_FORM_FIELD_IDS.calories,
      proteinG: INVENTORY_ADD_FORM_FIELD_IDS.proteinG,
      carbsG: INVENTORY_ADD_FORM_FIELD_IDS.carbsG,
      fatG: INVENTORY_ADD_FORM_FIELD_IDS.fatG,
    }).toEqual({
      nutritionBasis: "inventory-nutrition-basis",
      calories: "inventory-calories",
      proteinG: "inventory-protein-g",
      carbsG: "inventory-carbs-g",
      fatG: "inventory-fat-g",
    });
  });

  it("includes every nutrition field in barcode autofill", () => {
    expect(INVENTORY_BARCODE_AUTOFILL_FIELD_IDS).toEqual(expect.arrayContaining([
      INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis,
      INVENTORY_ADD_FORM_FIELD_IDS.calories,
      INVENTORY_ADD_FORM_FIELD_IDS.proteinG,
      INVENTORY_ADD_FORM_FIELD_IDS.carbsG,
      INVENTORY_ADD_FORM_FIELD_IDS.fatG,
    ]));
  });

  it("derives barcode autofill ids from add form field ids", () => {
    const fieldIds = new Set(Object.values(INVENTORY_ADD_FORM_FIELD_IDS));

    expect(INVENTORY_BARCODE_AUTOFILL_FIELD_IDS.every((fieldId) => fieldIds.has(fieldId))).toBe(true);
    expect(INVENTORY_BARCODE_AUTOFILL_FIELD_IDS).toEqual([
      INVENTORY_ADD_FORM_FIELD_IDS.name,
      INVENTORY_ADD_FORM_FIELD_IDS.quantity,
      INVENTORY_ADD_FORM_FIELD_IDS.unit,
      INVENTORY_ADD_FORM_FIELD_IDS.location,
      INVENTORY_ADD_FORM_FIELD_IDS.category,
      INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis,
      INVENTORY_ADD_FORM_FIELD_IDS.calories,
      INVENTORY_ADD_FORM_FIELD_IDS.proteinG,
      INVENTORY_ADD_FORM_FIELD_IDS.carbsG,
      INVENTORY_ADD_FORM_FIELD_IDS.fatG,
    ]);
  });

  it("excludes the barcode field from automatically restored autofill fields", () => {
    expect(INVENTORY_BARCODE_AUTOFILL_FIELD_IDS).not.toContain(INVENTORY_ADD_FORM_FIELD_IDS.barcode);
  });

  it("does not allow unknown form field keys at compile time", () => {
    // @ts-expect-error Unknown form field ids must not be accepted.
    expect(INVENTORY_ADD_FORM_FIELD_IDS.protein).toBeUndefined();
  });
});
