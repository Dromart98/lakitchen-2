import { describe, expect, it } from "vitest";

import { getCameraChoices, getNearFocusDistance, normalizeFocusPoint, selectFocusMode } from "@/modules/barcodes/camera";

describe("barcode camera helpers", () => {
  it("prioritizes continuous, auto, then manual only with a valid focus distance range", () => {
    expect(selectFocusMode({ focusMode: ["manual", "auto", "continuous"] })).toBe("continuous");
    expect(selectFocusMode({ focusMode: ["auto"] })).toBe("auto");
    expect(selectFocusMode({ focusMode: ["manual"], focusDistance: { min: 1, max: 4 } })).toBe("manual");
    expect(selectFocusMode({ focusMode: ["manual"] })).toBeNull();
  });

  it("uses one near-range manual focus distance and bounds touch points", () => {
    expect(getNearFocusDistance({ min: 1, max: 5 })).toBe(4);
    expect(normalizeFocusPoint(-10, 250, { left: 0, top: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 1 });
  });

  it("prefers a clearly identified rear primary lens over secondary lenses and keeps empty labels usable", () => {
    const devices = [
      { kind: "videoinput", deviceId: "ultra", label: "Rear Ultra Wide" },
      { kind: "videoinput", deviceId: "main", label: "Back Camera" },
      { kind: "videoinput", deviceId: "front", label: "Front Camera" },
    ] as MediaDeviceInfo[];
    expect(getCameraChoices(devices)).toEqual([
      { deviceId: "ultra", label: "Rear Ultra Wide", isPreferred: false },
      { deviceId: "main", label: "Back Camera", isPreferred: true },
    ]);
    expect(getCameraChoices([{ kind: "videoinput", deviceId: "one", label: "" }] as MediaDeviceInfo[])[0]?.label).toBe("Cámara 1");
    expect(getCameraChoices([
      { kind: "videoinput", deviceId: "one", label: "Back Camera 1" },
      { kind: "videoinput", deviceId: "two", label: "Back Camera 2" },
    ] as MediaDeviceInfo[]).every((choice) => !choice.isPreferred)).toBe(true);
  });
});
