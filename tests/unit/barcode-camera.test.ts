import { describe, expect, it } from "vitest";

import { getCameraChoices, getFocusConfiguration, getNearFocusDistance, getPreferredCameraId, normalizeFocusPoint } from "@/modules/barcodes/camera";

describe("barcode camera helpers", () => {
  it("prioritizes continuous, auto, then manual focus with a valid distance range", () => {
    expect(getFocusConfiguration(["continuous", "auto"])).toEqual({ mode: "continuous" });
    expect(getFocusConfiguration(["auto"])).toEqual({ mode: "auto" });
    expect(getFocusConfiguration(["manual"], { min: 2, max: 10 })).toEqual({ mode: "manual", distance: 3.2 });
    expect(getFocusConfiguration(["manual"], { min: 2, max: 2 })).toBeNull();
    expect(getFocusConfiguration(undefined)).toBeNull();
  });

  it("keeps near focus and touch points inside their valid ranges", () => {
    expect(getNearFocusDistance({ min: 0, max: 10 })).toBe(1.5);
    expect(normalizeFocusPoint(-10, 120, { left: 0, top: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 1 });
  });

  it("prefers a main rear camera and hides less useful lenses when alternatives exist", () => {
    const choices = getCameraChoices([
      { kind: "videoinput", deviceId: "wide", label: "Ultra wide" },
      { kind: "videoinput", deviceId: "rear", label: "Back Camera" },
      { kind: "videoinput", deviceId: "front", label: "" },
    ] as MediaDeviceInfo[]);
    expect(choices).toEqual([{ deviceId: "rear", label: "Back Camera" }, { deviceId: "front", label: "Cámara 2" }]);
    expect(getPreferredCameraId(choices)).toBe("rear");
  });
});
