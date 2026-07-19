import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getMacroModeMessages, resolveMacroMealMode } from "@/modules/meals/macro-meal-mode";
import { PHOTO_MEAL_MAX_BYTES } from "@/modules/meals/photo-meal-ai";

function messages(mode: ReturnType<typeof resolveMacroMealMode>) {
  return getMacroModeMessages({
    mode,
    genericErrorMessage: "generic-error",
    genericSuccessMessage: "generic-success",
    ingredientErrorMessage: "ingredient-error",
    ingredientSuccessMessage: "ingredient-success",
  });
}

describe("macro meal modes", () => {
  it.each([
    [undefined, "manual"],
    ["manual", "manual"],
    ["text-ai", "text-ai"],
    ["photo-ai", "photo-ai"],
    ["ingredients", "ingredients"],
    ["unknown", "manual"],
  ] as const)("resolves %s to %s", (value, expected) => {
    expect(resolveMacroMealMode(value)).toBe(expected);
  });

  it("delivers generic messages only to the selected non-ingredient mode", () => {
    expect(messages("manual")).toEqual({
      manual: { errorMessage: "generic-error", successMessage: "generic-success" },
      textAi: { errorMessage: null, successMessage: null },
      photoAi: { errorMessage: null, successMessage: null },
      ingredients: { errorMessage: null, successMessage: null },
    });
    expect(messages("text-ai").textAi).toEqual({ errorMessage: "generic-error", successMessage: "generic-success" });
    expect(messages("text-ai").photoAi).toEqual({ errorMessage: null, successMessage: null });
    expect(messages("photo-ai").photoAi).toEqual({ errorMessage: "generic-error", successMessage: "generic-success" });
    expect(messages("photo-ai").textAi).toEqual({ errorMessage: null, successMessage: null });
  });

  it("delivers ingredient messages only to ingredients", () => {
    const result = messages("ingredients");
    expect(result.ingredients).toEqual({ errorMessage: "ingredient-error", successMessage: "ingredient-success" });
    expect(result.manual).toEqual({ errorMessage: null, successMessage: null });
    expect(result.textAi).toEqual({ errorMessage: null, successMessage: null });
    expect(result.photoAi).toEqual({ errorMessage: null, successMessage: null });
  });
});

describe("photo upload limits", () => {
  it("allows transport overhead while preserving the 5 MB application limit", () => {
    const config = readFileSync(resolve(process.cwd(), "next.config.mjs"), "utf8");
    expect(config).toContain('bodySizeLimit: "6mb"');
    expect(PHOTO_MEAL_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
