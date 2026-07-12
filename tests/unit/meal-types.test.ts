import { describe, expect, it } from "vitest";

import { isMealType, MEAL_TYPE_LABELS, MEAL_TYPES, normalizeMealType } from "@/modules/meals/meal-types";

describe("meal types", () => {
  it("accepts the five allowed meal type values", () => {
    expect(MEAL_TYPES).toEqual(["breakfast", "lunch", "snack", "dinner", "other"]);
    expect(MEAL_TYPES.every(isMealType)).toBe(true);
  });

  it("rejects empty or unknown meal type values", () => {
    expect(isMealType("")).toBe(false);
    expect(isMealType("brunch")).toBe(false);
    expect(isMealType(null)).toBe(false);
  });

  it("provides the expected Spanish labels", () => {
    expect(MEAL_TYPE_LABELS).toEqual({
      breakfast: "Desayuno",
      lunch: "Comida",
      snack: "Merienda",
      dinner: "Cena",
      other: "Otro",
    });
  });

  it("keeps display order as breakfast, lunch, snack, dinner, and other", () => {
    expect(MEAL_TYPES.map((mealType) => MEAL_TYPE_LABELS[mealType])).toEqual([
      "Desayuno",
      "Comida",
      "Merienda",
      "Cena",
      "Otro",
    ]);
  });

  it("normalizes an unknown meal type to other", () => {
    expect(normalizeMealType("unexpected")).toBe("other");
  });
});
