"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { getRestoredBarcodeAutofillValue, normalizeBarcodeInput } from "@/modules/barcodes/barcode";
import {
  getCameraChoices,
  getNearFocusDistance,
  normalizeFocusPoint,
  selectFocusMode,
  type CameraChoice,
  type CameraFocusCapabilities,
} from "@/modules/barcodes/camera";
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

type FocusModeCapabilities = MediaTrackCapabilities & CameraFocusCapabilities;
type FocusModeSettings = MediaTrackSettings & { focusMode?: string; deviceId?: string };
type FocusModeConstraints = MediaTrackConstraints & {
  advanced: Array<MediaTrackConstraintSet & {
    focusMode?: string;
    focusDistance?: number;
    pointsOfInterest?: Array<{ x: number; y: number }>;
  }>;
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
const scannerIdleMessage = "Introduce o escanea un código para buscarlo en tu catálogo personal y en Open Food Facts.";
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
  const [message, setMessage] = useState(scannerIdleMessage);
  const [isPending, startTransition] = useTransition();
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameraChoices, setCameraChoices] = useState<CameraChoice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [canRefocus, setCanRefocus] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<HTMLElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const scannerRequestRef = useRef(0);
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

  function cleanupScanner({ resetStatus = true }: { resetStatus?: boolean } = {}) {
    scannerRequestRef.current += 1;
    scanningRef.current = false;

    if (loopRef.current !== null) {
      window.cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    setIsScanning(false);
    setCameraActive(false);
    setScannerError(null);
    setCameraChoices([]);
    setSelectedCameraId(null);
    setCanRefocus(false);
    if (resetStatus) setMessage(scannerIdleMessage);
  }

  function isCurrentSession(requestId: number, stream: MediaStream) {
    return scanningRef.current && scannerRequestRef.current === requestId && streamRef.current === stream;
  }

  function getFocusCapabilities(track: MediaStreamTrack): FocusModeCapabilities | undefined {
    return track.getCapabilities?.() as FocusModeCapabilities | undefined;
  }

  async function applyFocusConstraints(
    track: MediaStreamTrack,
    constraints: FocusModeConstraints,
    requestId: number,
    stream: MediaStream,
  ) {
    if (!track.applyConstraints || !isCurrentSession(requestId, stream)) return false;

    try {
      await track.applyConstraints(constraints);
      if (!isCurrentSession(requestId, stream)) return false;
      const settings = track.getSettings?.() as FocusModeSettings | undefined;
      const requestedFocusMode = constraints.advanced[0]?.focusMode;
      return !requestedFocusMode || !settings?.focusMode || settings.focusMode === requestedFocusMode;
    } catch {
      return false;
    }
  }

  async function configureAutofocus(track: MediaStreamTrack, requestId: number, stream: MediaStream) {
    const capabilities = getFocusCapabilities(track);
    const focusMode = selectFocusMode(capabilities);
    setCanRefocus(Boolean(capabilities?.pointsOfInterest) || capabilities?.focusMode?.includes("auto") === true);
    if (!focusMode) return;

    const advanced: FocusModeConstraints["advanced"][number] = { focusMode };
    if (focusMode === "manual" && capabilities?.focusDistance) {
      advanced.focusDistance = getNearFocusDistance(capabilities.focusDistance);
    }
    const focusApplied = await applyFocusConstraints(track, { advanced: [advanced] }, requestId, stream);
    if (!focusApplied && focusMode === "continuous" && capabilities?.focusMode?.includes("auto")) {
      await applyFocusConstraints(track, { advanced: [{ focusMode: "auto" }] }, requestId, stream);
    }
  }

  async function improveScanResolution(track: MediaStreamTrack, requestId: number, stream: MediaStream) {
    const settings = track.getSettings?.() as FocusModeSettings | undefined;
    if (!settings || (settings.width ?? 1280) >= 1280 && (settings.height ?? 720) >= 720) return;

    try {
      await track.applyConstraints?.({ width: { ideal: 1920 }, height: { ideal: 1080 } });
    } catch {
      // Las preferencias de resolución no deben interrumpir una cámara ya abierta.
    }
    if (!isCurrentSession(requestId, stream)) return;
    track.getSettings?.();
  }

  async function focusPreview(clientX: number, clientY: number, target: HTMLVideoElement) {
    const stream = streamRef.current;
    const requestId = scannerRequestRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!stream || !track || !isCurrentSession(requestId, stream)) return;

    const capabilities = getFocusCapabilities(track);
    const focusMode = selectFocusMode(capabilities);
    if (!focusMode) return;

    const advanced: FocusModeConstraints["advanced"][number] = {
      focusMode: capabilities?.focusMode?.includes("auto") ? "auto" : focusMode,
    };
    if (capabilities?.pointsOfInterest) {
      advanced.pointsOfInterest = [normalizeFocusPoint(clientX, clientY, target.getBoundingClientRect())];
    } else if (advanced.focusMode !== "auto") {
      return;
    }
    await applyFocusConstraints(track, { advanced: [advanced] }, requestId, stream);
  }

  async function loadCameraChoices(track: MediaStreamTrack, requestId: number, stream: MediaStream) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!isCurrentSession(requestId, stream)) return;

    const choices = getCameraChoices(devices);
    const settings = track.getSettings?.() as FocusModeSettings | undefined;
    const preferred = choices.find((choice) => choice.isPreferred);
    setCameraChoices(choices);
    setSelectedCameraId(settings?.deviceId ?? null);

    if (preferred && preferred.deviceId !== settings?.deviceId) {
      cleanupScanner({ resetStatus: false });
      void startScanner(preferred.deviceId);
    }
  }

  useEffect(() => () => cleanupScanner(), []);

  useEffect(() => {
    const details = controlsRef.current?.closest("details");
    if (!details) return;

    const cleanupScannerWhenClosed = () => {
      if (!details.open) cleanupScanner();
    };

    details.addEventListener("toggle", cleanupScannerWhenClosed);
    return () => details.removeEventListener("toggle", cleanupScannerWhenClosed);
  }, []);

  function updateBarcode(nextBarcode: string) {
    clearPreviousAutofill();
    setBarcode(nextBarcode);
    setInputValue(INVENTORY_ADD_FORM_FIELD_IDS.barcode, nextBarcode);
  }

  function applyBarcode(rawValue: string) {
    updateBarcode(normalizeBarcodeInput(rawValue));
  }

  async function startScanner(cameraId?: string) {
    if (scanningRef.current) return;

    const BarcodeDetector = getBarcodeDetector();
    if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setScannerError(unsupportedScannerMessage);
      setMessage(unsupportedScannerMessage);
      return;
    }

    cleanupScanner({ resetStatus: false });
    const requestId = scannerRequestRef.current + 1;
    scannerRequestRef.current = requestId;
    setScannerError(null);
    setMessage("Iniciando cámara...");
    setIsScanning(true);
    scanningRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(cameraId ? { deviceId: { ideal: cameraId } } : {}),
        },
        audio: false,
      });

      if (!scanningRef.current || scannerRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        cleanupScanner();
        return;
      }

      video.srcObject = stream;
      await video.play();

      if (!scanningRef.current || scannerRequestRef.current !== requestId) {
        cleanupScanner();
        return;
      }

      setCameraActive(true);
      setMessage("Cámara activa. Enfoca el código de barras.");
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        await configureAutofocus(videoTrack, requestId, stream);
        await improveScanResolution(videoTrack, requestId, stream);
        await loadCameraChoices(videoTrack, requestId, stream);
      }

      if (!isCurrentSession(requestId, stream)) return;

      const detector = new BarcodeDetector({ formats: ["ean_8", "ean_13", "upc_a", "itf"] });

      const scan = async () => {
        if (!scanningRef.current || scannerRequestRef.current !== requestId || !videoRef.current) return;

        try {
          const codes = await detector.detect(videoRef.current);
          if (!scanningRef.current || scannerRequestRef.current !== requestId) return;

          const detected = codes[0]?.rawValue;
          if (detected) {
            applyBarcode(detected);
            cleanupScanner({ resetStatus: false });
            setMessage("Código detectado. Revisa el valor y busca el producto.");
            return;
          }

          loopRef.current = window.requestAnimationFrame(scan);
        } catch {
          if (!scanningRef.current || scannerRequestRef.current !== requestId) return;
          cleanupScanner({ resetStatus: false });
          setScannerError("No se pudo leer el código. Inténtalo de nuevo o introdúcelo manualmente.");
          setMessage("No se pudo leer el código. Inténtalo de nuevo o introdúcelo manualmente.");
        }
      };

      loopRef.current = window.requestAnimationFrame(scan);
    } catch {
      if (!scanningRef.current || scannerRequestRef.current !== requestId) return;
      cleanupScanner({ resetStatus: false });
      setScannerError("No se pudo acceder a la cámara. Revisa los permisos o introduce el código manualmente.");
      setMessage("No se pudo acceder a la cámara. Revisa los permisos o introduce el código manualmente.");
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
    <section ref={controlsRef} className="barcode-lookup" aria-labelledby="barcode-lookup-heading">
      <div className="barcode-lookup__heading">
        <span>Código de barras</span>
        <h3 id="barcode-lookup-heading">Busca o escanea el producto</h3>
        <p>Primero consultaremos tu catálogo personal y, después, Open Food Facts.</p>
      </div>
      <div className="barcode-lookup__form-row">
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
        <button className="barcode-lookup__search" type="button" onClick={searchBarcode} disabled={isPending}>
          {isPending ? "Buscando..." : "Buscar producto"}
        </button>
      </div>
      <div className="barcode-lookup__actions">
        <button type="button" onClick={() => void startScanner()} disabled={isScanning}>
          Escanear código
        </button>
      </div>
      {isScanning ? (
        <div className="barcode-scanner">
          <p>Enfoca el código dentro del marco y mantén el producto estable.</p>
          <div className="barcode-scanner__frame">
            <video
              className="barcode-scanner__video"
              ref={videoRef}
              playsInline
              muted
              onClick={(event) => void focusPreview(event.clientX, event.clientY, event.currentTarget)}
            />
          </div>
          {cameraActive ? <p className="barcode-scanner__focus-help">Acerca o aleja el código y toca la imagen para intentar enfocar.</p> : null}
          <div className="barcode-scanner__actions">
            {cameraChoices.length > 1 ? (
              <label>
                <span>Cámara</span>
                <select
                  value={selectedCameraId ?? ""}
                  onChange={(event) => {
                    cleanupScanner({ resetStatus: false });
                    void startScanner(event.target.value);
                  }}
                >
                  {cameraChoices.map((choice) => <option key={choice.deviceId} value={choice.deviceId}>{choice.label}</option>)}
                </select>
              </label>
            ) : null}
            {canRefocus ? <button type="button" onClick={() => {
              const video = videoRef.current;
              if (video) void focusPreview(video.getBoundingClientRect().left + video.clientWidth / 2, video.getBoundingClientRect().top + video.clientHeight / 2, video);
            }}>Enfocar</button> : null}
            <button type="button" onClick={() => cleanupScanner()}>Cerrar escáner</button>
          </div>
        </div>
      ) : null}
      <p
        className={`barcode-lookup__status${scannerError ? " barcode-lookup__status--error" : isPending || message.startsWith("Buscando") || message.startsWith("No está") ? " barcode-lookup__status--searching" : message.startsWith("Producto encontrado") ? " barcode-lookup__status--result" : ""}`}
        aria-live="polite"
      >
        {scannerError ? <strong>Error de escaneo: </strong> : null}{message}
      </p>
      <label className="barcode-lookup__remember">
        <input name="remember_barcode_product" type="checkbox" />
        <span>
          <strong>Recordar este producto para futuros escaneos</strong>
          <small>Guardaremos los datos introducidos cuando añadas el producto al inventario.</small>
        </span>
      </label>
    </section>
  );
}
