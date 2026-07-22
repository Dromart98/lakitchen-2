export type CameraChoice = {
  deviceId: string;
  label: string;
};

export type FocusDistanceRange = { min?: number; max?: number };

export type FocusConfiguration =
  | { mode: "continuous" | "auto" }
  | { mode: "manual"; distance: number }
  | null;

const excludedCameraTerms = ["ultrawide", "ultra wide", "gran angular", "telephoto", "teleobjetivo", "depth", "macro"];

export function getFocusConfiguration(
  focusModes: readonly string[] | undefined,
  focusDistance?: FocusDistanceRange,
): FocusConfiguration {
  if (focusModes?.includes("continuous")) return { mode: "continuous" };
  if (focusModes?.includes("auto")) return { mode: "auto" };
  if (!focusModes?.includes("manual") || !hasFocusDistanceRange(focusDistance)) return null;

  return { mode: "manual", distance: getNearFocusDistance(focusDistance) };
}

export function hasFocusDistanceRange(range?: FocusDistanceRange): range is Required<FocusDistanceRange> {
  return Number.isFinite(range?.min) && Number.isFinite(range?.max) && (range?.max ?? 0) > (range?.min ?? 0);
}

export function getNearFocusDistance(range: Required<FocusDistanceRange>): number {
  return range.min + (range.max - range.min) * 0.15;
}

export function normalizeFocusPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp(rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5),
    y: clamp(rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5),
  };
}

export function isExcludedCameraLabel(label: string): boolean {
  const normalizedLabel = label.toLocaleLowerCase();
  return excludedCameraTerms.some((term) => normalizedLabel.includes(term));
}

export function getCameraChoices(devices: readonly MediaDeviceInfo[]): CameraChoice[] {
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const usefulCameras = cameras.filter((device) => !isExcludedCameraLabel(device.label));
  const choices = usefulCameras.length > 0 ? usefulCameras : cameras;

  return choices.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label.trim() || `Cámara ${index + 1}`,
  }));
}

export function getPreferredCameraId(choices: readonly CameraChoice[]): string | null {
  const rearCamera = choices.find((choice) => /back|rear|environment|trasera|posterior/i.test(choice.label));
  return rearCamera?.deviceId ?? choices[0]?.deviceId ?? null;
}
