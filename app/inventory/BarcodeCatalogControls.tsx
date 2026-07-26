"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { getRestoredBarcodeAutofillValue, normalizeBarcodeInput } from "@/modules/barcodes/barcode";
import { getCameraChoices, getFocusConfiguration, getPreferredCameraId, normalizeFocusPoint, shouldAutoSelectPreferredCamera, type CameraChoice } from "@/modules/barcodes/camera";
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

type FocusModeCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min?: number; max?: number };
  pointsOfInterest?: unknown;
};

type FocusModeConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  focusDistance?: number;
  pointsOfInterest?: Array<{ x: number; y: number }>;
};

type FocusModeConstraints = MediaTrackConstraints & { advanced: FocusModeConstraintSet[] };

type ScannerStartOptions = {
  cameraDeviceId?: string;
  selection?: "initial" | "automatic" | "manual";
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
  category?: string | null;
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
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameraChoices, setCameraChoices] = useState<CameraChoice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<HTMLElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const scannerRequestRef = useRef(0);
  const hasManualCameraSelectionRef = useRef(false);
  const hasAutomaticallySelectedCameraRef = useRef(false);
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

  function cleanupScanner({ resetStatus = true, resetCameraSelection = true }: { resetStatus?: boolean; resetCameraSelection?: boolean } = {}) {
    scannerRequestRef.current += 1;
    scanningRef.current = false;

    if (loopRef.current !== null) {
      window.cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    if (resetCameraSelection) {
      hasManualCameraSelectionRef.current = false;
      hasAutomaticallySelectedCameraRef.current = false;
    }
    setIsScanning(false);
    setScannerError(null);
    if (resetStatus) setMessage(scannerIdleMessage);
  }

  async function configureAutofocus(track: MediaStreamTrack) {
    if (!track.getCapabilities || !track.applyConstraints) return;

    const capabilities = track.getCapabilities() as FocusModeCapabilities;
    const configuration = getFocusConfiguration(capabilities.focusMode, capabilities.focusDistance);
    if (!configuration) return;

    try {
      const focusConstraints: FocusModeConstraints = {
        advanced: [configuration.mode === "manual"
          ? { focusMode: configuration.mode, focusDistance: configuration.distance }
          : { focusMode: configuration.mode }],
      };
      await track.applyConstraints(focusConstraints);
      track.getSettings();
    } catch {
      // El enfoque es opcional: el stream y el lector siguen siendo utilizables.
    }
  }

  async function loadCameraChoices(activeDeviceId: string, requestId: number) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const choices = getCameraChoices(await navigator.mediaDevices.enumerateDevices());
    if (!scanningRef.current || scannerRequestRef.current !== requestId) return;

    setCameraChoices(choices);
    const preferredCameraId = getPreferredCameraId(choices);
    if (shouldAutoSelectPreferredCamera({
      activeCameraId: activeDeviceId,
      preferredCameraId,
      hasManualSelection: hasManualCameraSelectionRef.current,
      hasAutomaticallySelected: hasAutomaticallySelectedCameraRef.current,
    })) {
      hasAutomaticallySelectedCameraRef.current = true;
      void startScanner({ cameraDeviceId: preferredCameraId ?? undefined, selection: "automatic" });
      return;
    }
    setSelectedCameraId(activeDeviceId || preferredCameraId);
  }

  async function focusCamera(clientX?: number, clientY?: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    const video = videoRef.current;
    if (!track || !video || !scanningRef.current) return;

    const capabilities = track.getCapabilities?.() as FocusModeCapabilities | undefined;
    const point = normalizeFocusPoint(clientX ?? video.getBoundingClientRect().left + video.getBoundingClientRect().width / 2, clientY ?? video.getBoundingClientRect().top + video.getBoundingClientRect().height / 2, video.getBoundingClientRect());
    try {
      if (capabilities?.pointsOfInterest) {
        await track.applyConstraints?.({ advanced: [{ pointsOfInterest: [point] }] } as FocusModeConstraints);
      } else if (capabilities?.focusMode?.includes("auto")) {
        await track.applyConstraints?.({ advanced: [{ focusMode: "auto" }] } as FocusModeConstraints);
      }
    } catch {
      // El enfoque manual es opcional y no interrumpe el lector.
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

  async function startScanner({ cameraDeviceId, selection = "initial" }: ScannerStartOptions = {}) {
    if (scanningRef.current && selection === "initial") return;

    const BarcodeDetector = getBarcodeDetector();
    if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setScannerError(unsupportedScannerMessage);
      setMessage(unsupportedScannerMessage);
      return;
    }

    if (selection === "manual") hasManualCameraSelectionRef.current = true;
    cleanupScanner({ resetStatus: false, resetCameraSelection: selection === "initial" });
    const requestId = scannerRequestRef.current + 1;
    scannerRequestRef.current = requestId;
    setScannerError(null);
    setMessage("Iniciando cámara...");
    setIsScanning(true);
    scanningRef.current = true;

    try {
      const videoConstraints: MediaTrackConstraints = cameraDeviceId
        ? { deviceId: { exact: cameraDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraDeviceId ? { deviceId: { exact: cameraDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

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

      setMessage("Cámara activa. Enfoca el código de barras.");
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        await configureAutofocus(videoTrack);
        await loadCameraChoices(videoTrack.getSettings().deviceId ?? cameraDeviceId ?? "", requestId);
      }

      if (!scanningRef.current || scannerRequestRef.current !== requestId) return;

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
            <video className="barcode-scanner__video" ref={videoRef} playsInline muted onClick={(event) => void focusCamera(event.clientX, event.clientY)} />
          </div>
          {cameraChoices.length > 1 ? (
            <label className="field" htmlFor="barcode-camera-choice">
              <span>Cámara</span>
              <select id="barcode-camera-choice" value={selectedCameraId ?? ""} onChange={(event) => void startScanner({ cameraDeviceId: event.target.value, selection: "manual" })}>
                {cameraChoices.map((camera) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>)}
              </select>
            </label>
          ) : null}
          <div className="barcode-scanner__actions">
            <button type="button" onClick={() => void focusCamera()}>Intentar enfocar</button>
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
