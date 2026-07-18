import { describe, expect, it } from "vitest";

import { isMealLogId, validateMacro, validateMealLogInput, validateMealName, validateMealType } from "@/modules/meals/meal-validation";

describe("meal validation", () => {
  it("accepts a valid UUID meal log id", () => {
    expect(isMealLogId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejects an incomplete UUID meal log id", () => {
    expect(isMealLogId("123e4567-e89b-12d3-a456")).toBe(false);
  });

  it("rejects an empty meal log id", () => {
    expect(isMealLogId("")).toBe(false);
  });

  it("rejects arbitrary text as a meal log id", () => {
    expect(isMealLogId("not-a-meal-id")).toBe(false);
  });

  it("rejects null as a meal log id", () => {
    expect(isMealLogId(null)).toBe(false);
  });

  it("rejects non-string meal log id values", () => {
    expect(isMealLogId(123)).toBe(false);
  });

  it("rejects an empty meal name", () => {
    expect(validateMealName("   ")).toEqual({ error: "meal-name-required" });
  });

  it("rejects meal names longer than 120 characters", () => {
    expect(validateMealName("a".repeat(121))).toEqual({ error: "meal-name-too-long" });
  });

  it("rejects negative macros", () => {
    expect(validateMacro("-1")).toEqual({ error: "invalid-macros" });
  });

  it.each(["245", "245.5", "6.9", "0.4", "0"])("accepts the numeric macro %s", (value) => {
    expect(validateMacro(value)).toEqual({ value: Number(value) });
  });

  it.each(["-1", "", "text", "Infinity"])("rejects the invalid macro %s", (value) => {
    expect(validateMacro(value)).toEqual({ error: "invalid-macros" });
  });

  it("accepts and normalizes a complete decimal meal form", () => {
    const formData = new FormData();
    formData.set("name", "Pollo con arroz");
    formData.set("meal_type", "lunch");
    formData.set("calories", "512.54");
    formData.set("protein_g", "46.9");
    formData.set("carbs_g", "52.44");
    formData.set("fat_g", "12.7");

    expect(validateMealLogInput(formData)).toEqual({
      value: { name: "Pollo con arroz", mealType: "lunch", calories: 512.5, proteinG: 46.9, carbsG: 52.4, fatG: 12.7 },
    });
  });

  it("rejects manipulated meal types", () => {
    expect(validateMealType("admin-breakfast")).toEqual({ error: "invalid-meal-type" });
  });
});
