import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const controls = readFileSync(
  resolve(process.cwd(), "app/inventory/BarcodeCatalogControls.tsx"),
  "utf8",
);

const cleanupScanner = controls.match(/  function cleanupScanner\([\s\S]*?\n  }\n\n  async function configureAutofocus/)?.[0] ?? "";
const startScanner = controls.match(/  async function startScanner\([\s\S]*?\n  }\n\n  async function lookupOpenFoodFacts/)?.[0] ?? "";

describe("inventory barcode camera lifecycle", () => {
  it("uses one cleanup routine for close, manual stop, unmount, and terminal scanner errors", () => {
    expect(cleanupScanner).toContain("scannerRequestRef.current += 1");
    expect(cleanupScanner).toContain("window.cancelAnimationFrame(loopRef.current)");
    expect(cleanupScanner).toContain("loopRef.current = null");
    expect(cleanupScanner).toContain("streamRef.current?.getTracks().forEach((track) => track.stop())");
    expect(cleanupScanner).toContain("streamRef.current = null");
    expect(cleanupScanner).toContain("videoRef.current.srcObject = null");
    expect(cleanupScanner).toContain("setIsScanning(false)");
    expect(cleanupScanner).toContain("setScannerError(null)");
    expect(cleanupScanner).toContain("setMessage(scannerIdleMessage)");
    expect(controls).toContain("useEffect(() => () => cleanupScanner(), []);");
    expect(controls).toContain('if (!details.open) cleanupScanner();');
    expect(controls).toContain("onClick={() => cleanupScanner()}");
    expect(startScanner).toContain("cleanupScanner({ resetStatus: false });");
  });

  it("invalidates late camera work instead of restoring an inactive reader", () => {
    expect(startScanner).toContain("const requestId = scannerRequestRef.current + 1");
    expect(startScanner).toContain("scannerRequestRef.current !== requestId");
    expect(startScanner).toContain("stream.getTracks().forEach((track) => track.stop())");
    expect(startScanner).toContain("await video.play()");
    expect(startScanner).toContain("if (!scanningRef.current || scannerRequestRef.current !== requestId) return;");
    expect(startScanner).toContain("setMessage(\"Cámara activa. Enfoca el código de barras.\")");
  });

  it("prefers a useful rear-camera stream and progressively configures supported autofocus", () => {
    expect(startScanner).toContain('facingMode: { ideal: "environment" }');
    expect(startScanner).toContain("width: { ideal: 1920 }");
    expect(startScanner).toContain("height: { ideal: 1080 }");
    expect(startScanner).toContain("width: { ideal: 1280 }");
    expect(startScanner).toContain("height: { ideal: 720 }");
    expect(startScanner).toContain("const videoTrack = stream.getVideoTracks()[0]");
    expect(controls).toContain("getFocusConfiguration(capabilities.focusMode, capabilities.focusDistance)");
    expect(controls).toContain("await track.applyConstraints(focusConstraints)");
    expect(controls).toContain("catch {\n      // El enfoque es opcional");
  });

  it("only restarts for a different preferred camera and retains choices for the selector", () => {
    expect(controls).toContain("if (preferredCameraId && preferredCameraId !== activeDeviceId)");
    expect(controls).toContain("void startScanner(preferredCameraId)");
    expect(controls).toContain("setCameraChoices(choices)");
    expect(controls).toContain("cameraChoices.length > 1");
    expect(controls).toContain("deviceId: { exact: cameraDeviceId }");
  });

  it("offers non-disruptive touch focus with points of interest and auto fallback", () => {
    expect(controls).toContain("normalizeFocusPoint(");
    expect(controls).toContain("capabilities?.pointsOfInterest");
    expect(controls).toContain("pointsOfInterest: [point]");
    expect(controls).toContain('focusMode: "auto"');
    expect(controls).toContain("Intentar enfocar");
    expect(controls).toContain("onClick={(event) => void focusCamera(event.clientX, event.clientY)}");
  });

  it("keeps the manual barcode field and inventory form integration unchanged", () => {
    expect(controls).toContain('name="barcode"');
    expect(controls).toContain("onChange={(event) => updateBarcode(event.target.value)}");
    expect(controls).toContain("setInputValue(INVENTORY_ADD_FORM_FIELD_IDS.barcode, nextBarcode)");
  });
});
