import { describe, expect, it } from "vitest";

import {
  normalizeBarcodeProductLocation,
  validateAndNormalizeBarcodeProductName,
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
});
