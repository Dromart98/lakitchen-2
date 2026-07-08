import { describe, expect, it } from "vitest";

import { calculateUserNutritionTargets } from "@/modules/user-nutrition/calculator";

describe("calculateUserNutritionTargets", () => {
  it("uses Mifflin-St Jeor and macro rules for maintenance", () => {
    expect(calculateUserNutritionTargets({ age: 30, sex: "male", heightCm: 180, weightKg: 80, goal: "maintain", activityLevel: "medium" })).toEqual({
      targetCalories: 2586,
      targetProteinG: 144,
      targetCarbsG: 359,
      targetFatG: 64,
    });
  });

  it("applies fat loss deficit and clamps negative carbs to zero", () => {
    expect(calculateUserNutritionTargets({ age: 45, sex: "female", heightCm: 150, weightKg: 40, goal: "lose_fat", activityLevel: "low" })).toEqual({
      targetCalories: 882,
      targetProteinG: 80,
      targetCarbsG: 60,
      targetFatG: 32,
    });
  });
});
