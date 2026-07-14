"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { getRestoredBarcodeAutofillValue, normalizeBarcodeInput } from "@/modules/barcodes/barcode";
import { INVENTORY_ADD_FORM_FIELD_IDS, INVENTORY_BARCODE_AUTOFILL_FIELD_IDS } from "@/modules/inventory/inventory-form-fields";
import type { lookupBarcodeProductAction } from "./actions";

type BarcodeLookupAction = typeof lookupBarcodeProductAction;

type BarcodeDetectorBarcode = { rawValue: string };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorBarcode[]>;
};

type BarcodeCatalogControlsProps = {
  lookupAction: BarcodeLookupAction;
};

type AutofillFieldState = {
  id: string;
  appliedValue: string;
  previousValue: string;
};

type BarcodeAutofillState = {
  barcode: string;
  fields: AutofillFieldState[];
};

type ExternalBarcodeProduct = {
  barcode: string;
  name: string;
  default_quantity: number;
  default_unit: "ud" | "g" | "kg" | "ml" | "l";
  default_location: "pantry" | "fridge" | "freezer" | null;
  category?: string;
  nutrition_basis?: string;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

type ExternalLookupResult =
  | { status: "found"; source: "open-food-facts"; product: ExternalBarcodeProduct }
  | { status: "unknown"; barcode: string }
  | { status: "invalid" | "error"; message: string };

const unsupportedScannerMessage = "Tu navegador no permite escanear directamente. Introduce el código manualmente.";
const autofillFieldIds = INVENTORY_BARCODE_AUTOFILL_FIELD_IDS;

function getInputElement(id: string): HTMLInputElement | HTMLSelectElement | null {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
}

function getInputValue(id: string): string {
  return getInputElement(id)?.value ?? "";
}

function setInputValue(id: string, value: string | number | null | undefined) {
  const element = getInputElement(id);
  if (!element || value === null || value === undefined) return;

  element.value = String(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (!("BarcodeDetector" in window)) return null;
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

function getAutofillValues(product: ExternalBarcodeProduct): Record<(typeof autofillFieldIds)[number], string> {
  const hasNutrition = [product.calories, product.protein_g, product.carbs_g, product.fat_g]
    .some((value) => value !== null && value !== undefined);

  return {
    [INVENTORY_ADD_FORM_FIELD_IDS.name]: product.name,
    [INVENTORY_ADD_FORM_FIELD_IDS.quantity]: String(product.default_quantity),
    [INVENTORY_ADD_FORM_FIELD_IDS.unit]: product.default_unit,
    [INVENTORY_ADD_FORM_FIELD_IDS.location]: product.default_location ?? "",
    [INVENTORY_ADD_FORM_FIELD_IDS.category]: product.category ?? "",
    [INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis]: hasNutrition ? product.nutrition_basis ?? "per_100g" : "",
    [INVENTORY_ADD_FORM_FIELD_IDS.calories]: product.calories === null || product.calories === undefined ? "" : String(product.calories),
    [INVENTORY_ADD_FORM_FIELD_IDS.proteinG]: product.protein_g === null || product.protein_g === undefined ? "" : String(product.protein_g),
    [INVENTORY_ADD_FORM_FIELD_IDS.carbsG]: product.carbs_g === null || product.carbs_g === undefined ? "" : String(product.carbs_g),
    [INVENTORY_ADD_FORM_FIELD_IDS.fatG]: product.fat_g === null || product.fat_g === undefined ? "" : String(product.fat_g),
  };
}

export function BarcodeCatalogControls({ lookupAction }: BarcodeCatalogControlsProps) {
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState("Introduce o escanea un código para buscarlo en tu catálogo personal y en Open Food Facts.");
  const [isPending, startTransition] = useTransition();
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const lastAutofillRef = useRef<BarcodeAutofillState | null>(null);

  function clearPreviousAutofill() {
    const previousAutofill = lastAutofillRef.current;
    if (!previousAutofill) return;

    previousAutofill.fields.forEach((field) => {
      setInputValue(field.id, getRestoredBarcodeAutofillValue(getInputValue(field.id), field.appliedValue, field.previousValue));
    });
    lastAutofillRef.current = null;
  }

  function applyProduct(product: ExternalBarcodeProduct, source: "personal" | "open-food-facts") {
    clearPreviousAutofill();
    const appliedValues = getAutofillValues(product);

    lastAutofillRef.current = {
      barcode: product.barcode,
      fields: autofillFieldIds.map((id) => ({
        id,
        appliedValue: appliedValues[id],
        previousValue: getInputValue(id),
      })),
    };

    autofillFieldIds.forEach((id) => setInputValue(id, appliedValues[id]));
    setMessage(
      source === "personal"
        ? "Producto encontrado en tu catálogo. Revisa los datos antes de añadirlo."
        : "Producto encontrado en Open Food Facts. Revisa y corrige los datos antes de añadirlo.",
    );
  }

  function stopScanner() {
    scanningRef.current = false;
    if (loopRef.current !== null) {
      window.cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScanning(false);
  }

  useEffect(() => () => stopScanner(), []);

  function updateBarcode(nextBarcode: string) {
    clearPreviousAutofill();
    setBarcode(nextBarcode);
    setInputValue(INVENTORY_ADD_FORM_FIELD_IDS.barcode, nextBarcode);
  }

  function applyBarcode(rawValue: string) {
    updateBarcode(normalizeBarcodeInput(rawValue));
  }

  async function startScanner() {
    if (isScanning || scanningRef.current) return;

    const BarcodeDetector = getBarcodeDetector();
    if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setScannerError(unsupportedScannerMessage);
      setMessage(unsupportedScannerMessage);
      return;
    }

    setScannerError(null);
    setMessage("Cámara activa. Enfoca el código de barras.");
    setIsScanning(true);
    scanningRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;

      if (!videoRef.current) {
        stopScanner();
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const detector = new BarcodeDetector({ formats: ["ean_8", "ean_13", "upc_a", "itf"] });

      const scan = async () => {
        if (!scanningRef.current || !videoRef.current) return;

        try {
          const codes = await detector.detect(videoRef.current);
          const detected = codes[0]?.rawValue;

          if (detected) {
            applyBarcode(detected);
            setMessage("Código detectado. Revisa el valor y busca el producto.");
            stopScanner();
            return;
          }

          loopRef.current = window.requestAnimationFrame(scan);
        } catch {
          setScannerError("No se pudo leer el código. Inténtalo de nuevo o introdúcelo manualmente.");
          setMessage("No se pudo leer el código. Inténtalo de nuevo o introdúcelo manualmente.");
          stopScanner();
        }
      };

      loopRef.current = window.requestAnimationFrame(scan);
    } catch {
      setScannerError("No se pudo acceder a la cámara. Revisa los permisos o introduce el código manualmente.");
      setMessage("No se pudo acceder a la cámara. Revisa los permisos o introduce el código manualmente.");
      stopScanner();
    }
  }

  async function lookupOpenFoodFacts(normalized: string): Promise<ExternalLookupResult> {
    const response = await fetch(`/api/barcodes/${encodeURIComponent(normalized)}`, { cache: "no-store" });
    const result = await response.json() as ExternalLookupResult;
    return result;
  }

  function searchBarcode() {
    const normalized = normalizeBarcodeInput(barcode);
    setBarcode(normalized);
    setInputValue(INVENTORY_ADD_FORM_FIELD_IDS.barcode, normalized);
    setMessage("Buscando primero en tu catálogo personal...");

    startTransition(async () => {
      try {
        const personalResult = await lookupAction(normalized);

        if (personalResult.status === "invalid") {
          clearPreviousAutofill();
          setMessage(personalResult.message);
          return;
        }

        if (personalResult.status === "found") {
          applyProduct(personalResult.product, "personal");
          return;
        }

        setMessage("No está en tu catálogo. Buscando en Open Food Facts...");
        const externalResult = await lookupOpenFoodFacts(normalized);

        if (externalResult.status === "found") {
          applyProduct(externalResult.product, "open-food-facts");
          return;
        }

        clearPreviousAutofill();
        setMessage(
          externalResult.status === "unknown"
            ? "No encontramos este código. Completa los datos manualmente y marca la opción de recordarlo."
            : externalResult.message,
        );
      } catch {
        clearPreviousAutofill();
        setMessage("No se pudo buscar el código. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="meal-log-form" aria-live="polite">
      <label className="field" htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.barcode}>
        <span>Código de barras</span>
        <input
          id={INVENTORY_ADD_FORM_FIELD_IDS.barcode}
          name="barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={barcode}
          onChange={(event) => updateBarcode(event.target.value)}
          placeholder="4006381333931"
        />
      </label>
      <div>
        <button className="button" type="button" onClick={searchBarcode} disabled={isPending}>
          {isPending ? "Buscando..." : "Buscar producto"}
        </button>
        <button className="button nav-button" type="button" onClick={startScanner} disabled={isScanning} style={{ marginLeft: 8 }}>
          Escanear código
        </button>
      </div>
      {isScanning ? (
        <div>
          <video ref={videoRef} playsInline muted style={{ width: "100%", maxHeight: 240, background: "#111", borderRadius: 12 }} />
          <button className="button nav-button" type="button" onClick={stopScanner}>
            Cerrar escáner
          </button>
        </div>
      ) : null}
      <p className={scannerError ? "auth-message error" : "muted"}>{message}</p>
      <label>
        <input name="remember_barcode_product" type="checkbox" /> Recordar este producto para futuros escaneos
      </label>
    </div>
  );
}
