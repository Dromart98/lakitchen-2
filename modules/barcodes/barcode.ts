export type BarcodeValidationResult =
  | { ok: true; barcode: string }
  | { ok: false; code: "empty" | "invalid-characters" | "invalid-length" | "invalid-check-digit"; message: string };

const supportedBarcodeLengths = [8, 12, 13, 14] as const;

export function normalizeBarcodeInput(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

function calculateGs1CheckDigit(payload: string): number {
  const sum = [...payload].reverse().reduce((total, digit, index) => {
    return total + Number(digit) * (index % 2 === 0 ? 3 : 1);
  }, 0);

  return (10 - (sum % 10)) % 10;
}

export function isSupportedBarcodeLength(length: number): boolean {
  return supportedBarcodeLengths.some((supportedLength) => supportedLength === length);
}

export function validateBarcodeInput(value: string): BarcodeValidationResult {
  const barcode = normalizeBarcodeInput(value);

  if (!barcode) {
    return { ok: false, code: "empty", message: "Introduce un código de barras." };
  }

  if (!/^\d+$/.test(barcode)) {
    return { ok: false, code: "invalid-characters", message: "El código solo puede contener números, espacios o guiones." };
  }

  if (!isSupportedBarcodeLength(barcode.length)) {
    return { ok: false, code: "invalid-length", message: "El código debe tener 8, 12, 13 o 14 dígitos." };
  }

  const expectedCheckDigit = calculateGs1CheckDigit(barcode.slice(0, -1));
  const actualCheckDigit = Number(barcode.at(-1));

  if (expectedCheckDigit !== actualCheckDigit) {
    return { ok: false, code: "invalid-check-digit", message: "El dígito de control del código no es válido." };
  }

  return { ok: true, barcode };
}

export function getRestoredBarcodeAutofillValue(
  currentValue: string,
  appliedValue: string,
  previousValue: string,
): string {
  return currentValue === appliedValue ? previousValue : currentValue;
}
