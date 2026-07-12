import { describe, expect, it } from "vitest";

import { isMealLogId, validateMacro, validateMealName, validateMealType } from "@/modules/meals/meal-validation";

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

  it("rejects decimal macros", () => {
    expect(validateMacro("1.5")).toEqual({ error: "invalid-macros" });
  });

  it("rejects manipulated meal types", () => {
    expect(validateMealType("admin-breakfast")).toEqual({ error: "invalid-meal-type" });
  });
});
