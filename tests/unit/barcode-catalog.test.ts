import { describe, expect, it } from "vitest";

import {
  normalizeBarcodeProductLocation,
  validateAndNormalizeBarcodeProductName,
  validateBarcodeProductCategory,
  validateBarcodeProductNutritionBasis,
  validateBarcodeProductNutritionFields,
  validateBarcodeProductNutritionNumber,
  validateBarcodeProductQuantity,
  validateBarcodeProductUnit,
} from "@/modules/barcodes/barcode-catalog";

describe("barcode catalog helpers", () => {
  it("normalizes valid product names", () => {
    expect(validateAndNormalizeBarcodeProductName("  Arroz integral  ")).toEqual({ ok: true, value: "Arroz integral" });
  });

  it("rejects blank and too long product names", () => {
    expect(validateAndNormalizeBarcodeProductName("   ")).toEqual({ ok: false, code: "invalid" });
    expect(validateAndNormalizeBarcodeProductName("a".repeat(121))).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts only finite positive quantities", () => {
    expect(validateBarcodeProductQuantity("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(validateBarcodeProductQuantity("0")).toEqual({ ok: false, code: "invalid" });
    expect(validateBarcodeProductQuantity("Infinity")).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts only supported units", () => {
    expect(validateBarcodeProductUnit("kg")).toEqual({ ok: true, value: "kg" });
    expect(validateBarcodeProductUnit("oz")).toEqual({ ok: false, code: "invalid" });
  });

  it("normalizes empty locations to null and validates supported locations", () => {
    expect(normalizeBarcodeProductLocation("")).toEqual({ ok: true, value: null });
    expect(normalizeBarcodeProductLocation("fridge")).toEqual({ ok: true, value: "fridge" });
    expect(normalizeBarcodeProductLocation("cupboard")).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts valid categories", () => {
    expect(validateBarcodeProductCategory("vegetable")).toEqual({ ok: true, value: "vegetable" });
  });

  it("rejects invalid categories", () => {
    expect(validateBarcodeProductCategory("snack")).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts valid nutrition bases", () => {
    expect(validateBarcodeProductNutritionBasis("per_100g")).toEqual({ ok: true, value: "per_100g" });
  });

  it("accepts an empty nutrition basis when there are no macros", () => {
    expect(validateBarcodeProductNutritionFields({
      nutrition_basis: "",
      calories: "",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
    })).toEqual({
      ok: true,
      value: { nutritionBasis: null, calories: null, proteinG: null, carbsG: null, fatG: null },
    });
  });

  it("rejects macros without a nutrition basis", () => {
    expect(validateBarcodeProductNutritionFields({
      nutrition_basis: "",
      calories: "120",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
    })).toEqual({ ok: false, code: "invalid" });
  });

  it("normalizes empty nutrition numbers to null", () => {
    expect(validateBarcodeProductNutritionNumber("")).toEqual({ ok: true, value: null });
  });

  it("accepts zero nutrition numbers", () => {
    expect(validateBarcodeProductNutritionNumber("0")).toEqual({ ok: true, value: 0 });
  });

  it("rejects negative nutrition numbers", () => {
    expect(validateBarcodeProductNutritionNumber("-1")).toEqual({ ok: false, code: "invalid" });
  });

  it("rejects Infinity nutrition numbers", () => {
    expect(validateBarcodeProductNutritionNumber("Infinity")).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts partial nutrition values with a valid basis", () => {
    expect(validateBarcodeProductNutritionFields({
      nutrition_basis: "per_unit",
      calories: "90",
      protein_g: "",
      carbs_g: "12.5",
      fat_g: "",
    })).toEqual({
      ok: true,
      value: { nutritionBasis: "per_unit", calories: 90, proteinG: null, carbsG: 12.5, fatG: null },
    });
  });

  it("allows clearing all nutrition values", () => {
    expect(validateBarcodeProductNutritionFields({
      nutrition_basis: "",
      calories: "",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
    })).toEqual({
      ok: true,
      value: { nutritionBasis: null, calories: null, proteinG: null, carbsG: null, fatG: null },
    });
  });

  it("does not mutate nutrition input objects", () => {
    const input = {
      nutrition_basis: "per_100ml",
      calories: "45",
      protein_g: "1",
      carbs_g: "10",
      fat_g: "0",
    };
    const copy = { ...input };

    validateBarcodeProductNutritionFields(input);

    expect(input).toEqual(copy);
  });
});
