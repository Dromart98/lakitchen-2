
import { describe, expect, it } from "vitest";

import { getMacroModeMessages, resolveMacroMealMode } from "@/modules/meals/macro-meal-mode";
import { PHOTO_MEAL_MAX_BYTES } from "@/modules/meals/photo-meal-ai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function messages(mode: ReturnType<typeof resolveMacroMealMode>) {
  return getMacroModeMessages({
    mode,
    genericErrorMessage: "generic-error",
    genericSuccessMessage: "generic-success",
    ingredientErrorMessage: "ingredient-error",
    ingredientSuccessMessage: "ingredient-success",
    aiInventoryErrorMessage: "ai-inventory-error",
    aiInventorySuccessMessage: "ai-inventory-success",
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


  it("uses inventory messages only for the originating AI mode", () => {
    const input = { genericErrorMessage: null, genericSuccessMessage: null, ingredientErrorMessage: "ingredient-error", ingredientSuccessMessage: "ingredient-success", aiInventoryErrorMessage: "quantity-too-high", aiInventorySuccessMessage: "Comida registrada y productos descontados correctamente." };
    expect(getMacroModeMessages({ mode: "text-ai", ...input }).textAi).toEqual({ errorMessage: "quantity-too-high", successMessage: "Comida registrada y productos descontados correctamente." });
    expect(getMacroModeMessages({ mode: "photo-ai", ...input }).photoAi).toEqual({ errorMessage: "quantity-too-high", successMessage: "Comida registrada y productos descontados correctamente." });
    expect(getMacroModeMessages({ mode: "manual", ...input }).manual).toEqual({ errorMessage: null, successMessage: null });
    expect(getMacroModeMessages({ mode: "ingredients", ...input }).ingredients).toEqual({ errorMessage: "ingredient-error", successMessage: "ingredient-success" });
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

describe("Text AI confirmation form", () => {
  it("submits only the validated meal fields and preserves the Text AI destination", () => {
    const preview = readFileSync(resolve(process.cwd(), "components/macros/AiMealEstimationPreview.tsx"), "utf8");
    for (const field of ["return_to", "meal_mode", "name", "meal_type"]) expect(preview).toContain(`name=\"${field}\"`);
    for (const field of ["calories", "protein_g", "carbs_g", "fat_g"]) expect(preview).toContain(`['${field}'`);
    expect(preview).toContain('name="return_to" value="/macros"');
    const estimator = readFileSync(resolve(process.cwd(), "components/macros/TextAiMealEstimator.tsx"), "utf8");
    expect(estimator).toContain('mealMode="text-ai"');
    expect(preview).not.toContain("consume_meal_builder_items_and_log_meal");
  });
});
