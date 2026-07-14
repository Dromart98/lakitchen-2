import { describe, expect, it } from "vitest";

import { getRestoredBarcodeAutofillValue, normalizeBarcodeInput, validateBarcodeInput } from "@/modules/barcodes/barcode";

describe("barcode helpers", () => {
  it("removes spaces and hyphens", () => {
    expect(normalizeBarcodeInput(" 4006-3813 33931 ")).toBe("4006381333931");
  });

  it("accepts valid EAN-8, UPC-A, EAN-13 and ITF-14 codes", () => {
    expect(validateBarcodeInput("96385074")).toEqual({ ok: true, barcode: "96385074" });
    expect(validateBarcodeInput("036000291452")).toEqual({ ok: true, barcode: "036000291452" });
    expect(validateBarcodeInput("4006381333931")).toEqual({ ok: true, barcode: "4006381333931" });
    expect(validateBarcodeInput("10012345000017")).toEqual({ ok: true, barcode: "10012345000017" });
  });

  it("rejects empty values", () => {
    expect(validateBarcodeInput("   ")).toMatchObject({ ok: false, code: "empty" });
  });

  it("rejects letters and symbols instead of silently changing them", () => {
    expect(validateBarcodeInput("400638133393A")).toMatchObject({ ok: false, code: "invalid-characters" });
    expect(validateBarcodeInput("4006381333931!")).toMatchObject({ ok: false, code: "invalid-characters" });
  });

  it("rejects unsupported lengths", () => {
    expect(validateBarcodeInput("1234567")).toMatchObject({ ok: false, code: "invalid-length" });
    expect(validateBarcodeInput("123456789")).toMatchObject({ ok: false, code: "invalid-length" });
  });


  it("restores the previous value when the current value is still the autofilled value", () => {
    expect(getRestoredBarcodeAutofillValue("Arroz", "Arroz", "")).toBe("");
  });

  it("keeps a manually edited value when it no longer matches the autofilled value", () => {
    expect(getRestoredBarcodeAutofillValue("Arroz integral editado", "Arroz", "")).toBe("Arroz integral editado");
  });

  it("rejects invalid GS1 check digits", () => {
    expect(validateBarcodeInput("4006381333932")).toMatchObject({ ok: false, code: "invalid-check-digit" });
  });
});
