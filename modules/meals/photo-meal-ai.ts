import { z } from "zod";
import type { TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

export const PHOTO_MEAL_MAX_BYTES = 5 * 1024 * 1024;
export type PhotoMealEstimationResult = TextMealEstimationResult;
export type PhotoMealErrorCode = "invalid-photo" | "unsupported-photo" | "photo-too-large" | "photo-processing-failed" | "unauthenticated" | "missing-api-key" | "provider-timeout" | "provider-error" | "invalid-ai-response" | "unexpected-error";
export const photoMealContextSchema = z.object({ context: z.string().trim().max(500) }).strict();
export function hasJpegSignature(bytes: Uint8Array) { return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; }
export async function validatePhotoMealFile(value: unknown): Promise<{ ok: true; file: File } | { ok: false; code: PhotoMealErrorCode }> {
  if (!(value instanceof File)) return { ok: false, code: "invalid-photo" };
  if (value.size <= 0) return { ok: false, code: "invalid-photo" };
  if (value.size > PHOTO_MEAL_MAX_BYTES) return { ok: false, code: "photo-too-large" };
  if (value.type !== "image/jpeg") return { ok: false, code: "unsupported-photo" };
  if (!hasJpegSignature(new Uint8Array(await value.arrayBuffer()).slice(0, 3))) return { ok: false, code: "invalid-photo" };
  return { ok: true, file: value };
}
