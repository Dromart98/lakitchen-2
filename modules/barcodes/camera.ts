export type FocusDistanceRange = { min: number; max: number };

export type CameraFocusCapabilities = {
  focusMode?: string[];
  focusDistance?: FocusDistanceRange;
  pointsOfInterest?: unknown;
};

export type FocusMode = "continuous" | "auto" | "manual";

export type CameraChoice = {
  deviceId: string;
  label: string;
  isPreferred: boolean;
};

const rearCameraPattern = /back|rear|environment|trasera|posterior/i;
const secondaryLensPattern = /ultra\s*wide|ultrawide|gran\s*angular|telephoto|teleobjetivo|depth|macro/i;

export function selectFocusMode(capabilities: CameraFocusCapabilities | undefined): FocusMode | null {
  const modes = capabilities?.focusMode;
  if (!Array.isArray(modes)) return null;
  if (modes.includes("continuous")) return "continuous";
  if (modes.includes("auto")) return "auto";
  const distance = capabilities?.focusDistance;
  return modes.includes("manual") && hasFocusDistanceRange(distance) ? "manual" : null;
}

export function hasFocusDistanceRange(distance: FocusDistanceRange | undefined): distance is FocusDistanceRange {
  return Boolean(distance && Number.isFinite(distance.min) && Number.isFinite(distance.max) && distance.max >= distance.min);
}

// focusDistance is measured in diopters, where higher values focus closer; use one near-range attempt.
export function getNearFocusDistance(distance: FocusDistanceRange): number {
  return distance.min + (distance.max - distance.min) * 0.75;
}

export function normalizeFocusPoint(x: number, y: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp((x - rect.left) / Math.max(rect.width, 1)),
    y: clamp((y - rect.top) / Math.max(rect.height, 1)),
  };
}

export function getCameraChoices(devices: MediaDeviceInfo[]): CameraChoice[] {
  const videoInputs = devices.filter((device) => device.kind === "videoinput");
  const rearInputs = videoInputs.filter((device) => rearCameraPattern.test(device.label));
  const candidates = rearInputs.length > 0 ? rearInputs : videoInputs;
  const primaryCandidates = candidates.filter((device) => !secondaryLensPattern.test(device.label));
  const preferredId = primaryCandidates.length === 1 ? primaryCandidates[0].deviceId : null;

  return candidates.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label || `Cámara ${index + 1}`,
    isPreferred: device.deviceId === preferredId,
  }));
}
