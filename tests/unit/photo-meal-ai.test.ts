import { describe, expect, it } from "vitest";
import { PHOTO_MEAL_MAX_BYTES, photoMealContextSchema, validatePhotoMealFile } from "@/modules/meals/photo-meal-ai";
const file = (bytes: number[], type = "image/jpeg") => new File([new Uint8Array(bytes)], "meal", { type });
describe("photo meal file validation", () => {
  it("accepts a valid JPEG", async () => expect(await validatePhotoMealFile(file([0xff, 0xd8, 0xff, 0]))).toMatchObject({ ok: true }));
  it("rejects invalid files with safe codes", async () => {
    const cases: Array<[unknown, string]> = [[file([]), "invalid-photo"], [new File([new Uint8Array(PHOTO_MEAL_MAX_BYTES + 1)], "large", { type: "image/jpeg" }), "photo-too-large"], [file([0x89, 0x50, 0x4e], "image/png"), "unsupported-photo"], [file([0x52, 0x49, 0x46], "image/webp"), "unsupported-photo"], [file([0xff, 0xd8, 0xff], "application/octet-stream"), "unsupported-photo"], [file([0x00, 0x00, 0x00]), "invalid-photo"], [file([0x89, 0x50, 0x4e], "image/jpeg"), "invalid-photo"], ["photo", "invalid-photo"], [null, "invalid-photo"], [{ type: "image/jpeg" }, "invalid-photo"]];
    for (const [value, code] of cases) expect(await validatePhotoMealFile(value)).toMatchObject({ ok: false, code });
  });
});
describe("photo meal context", () => { it("accepts bounded strict context", () => { expect(photoMealContextSchema.safeParse({ context: "" }).success).toBe(true); expect(photoMealContextSchema.safeParse({ context: "pollo" }).success).toBe(true); expect(photoMealContextSchema.safeParse({ context: "x".repeat(500) }).success).toBe(true); expect(photoMealContextSchema.safeParse({ context: "x".repeat(501) }).success).toBe(false); expect(photoMealContextSchema.safeParse({ context: "", extra: true }).success).toBe(false); }); });
