"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { getRestoredBarcodeAutofillValue, normalizeBarcodeInput } from "@/modules/barcodes/barcode";
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

const unsupportedScannerMessage = "Tu navegador no permite escanear directamente. Introduce el código manualmente.";
const autofillFieldIds = ["inventory-name", "inventory-quantity", "inventory-unit", "inventory-location"] as const;

function getInputElement(id: string): HTMLInputElement | HTMLSelectElement | null {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
}

function getInputValue(id: string): string {
  return getInputElement(id)?.value ?? "";
}

function setInputValue(id: string, value: string | number | null) {
  const element = getInputElement(id);
  if (!element || value === null) return;

  element.value = String(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (!("BarcodeDetector" in window)) return null;
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

export function BarcodeCatalogControls({ lookupAction }: BarcodeCatalogControlsProps) {
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState("Introduce o escanea un código para buscarlo en tu catálogo personal.");
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
      setInputValue(
        field.id,
        getRestoredBarcodeAutofillValue(getInputValue(field.id), field.appliedValue, field.previousValue),
      );
    });
    lastAutofillRef.current = null;
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

  useEffect(() => {
    return () => stopScanner();
  }, []);

  function updateBarcode(nextBarcode: string) {
    clearPreviousAutofill();
    setBarcode(nextBarcode);
    setInputValue("inventory-barcode", nextBarcode);
  }

  function applyBarcode(rawValue: string) {
    updateBarcode(normalizeBarcodeInput(rawValue));
  }

  async function startScanner() {
    if (isScanning || scanningRef.current) return;

    const BarcodeDetector = getBarcodeDetector();
    if (!BarcodeDetector) {
      setScannerError(unsupportedScannerMessage);
      setMessage(unsupportedScannerMessage);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
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

  function searchBarcode() {
    const normalized = normalizeBarcodeInput(barcode);
    setBarcode(normalized);
    setInputValue("inventory-barcode", normalized);
    setMessage("Buscando producto...");

    startTransition(async () => {
      try {
        const result = await lookupAction(normalized);

        if (result.status === "invalid") {
          clearPreviousAutofill();
          setMessage(result.message);
          return;
        }

        if (result.status === "error") {
          clearPreviousAutofill();
          setMessage(result.message);
          return;
        }

        if (result.status === "unknown") {
          clearPreviousAutofill();
          setMessage(result.message);
          return;
        }

        clearPreviousAutofill();
        const appliedValues = {
          "inventory-name": result.product.name,
          "inventory-quantity": String(result.product.default_quantity),
          "inventory-unit": result.product.default_unit,
          "inventory-location": result.product.default_location ?? "",
        };
        lastAutofillRef.current = {
          barcode: result.product.barcode,
          fields: autofillFieldIds.map((id) => ({
            id,
            appliedValue: appliedValues[id],
            previousValue: getInputValue(id),
          })),
        };
        setInputValue("inventory-name", result.product.name);
        setInputValue("inventory-quantity", result.product.default_quantity);
        setInputValue("inventory-unit", result.product.default_unit);
        setInputValue("inventory-location", result.product.default_location);
        setMessage("Producto encontrado. Revisa los datos antes de añadirlo al inventario.");
      } catch {
        clearPreviousAutofill();
        setMessage("No se pudo buscar el código. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="meal-log-form" aria-live="polite">
      <label className="field" htmlFor="inventory-barcode">
        <span>Código de barras</span>
        <input
          id="inventory-barcode"
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
