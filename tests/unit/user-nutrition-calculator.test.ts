import { describe, expect, it } from "vitest";

import { calculateUserNutritionTargets } from "@/modules/user-nutrition/calculator";

describe("calculateUserNutritionTargets", () => {
  it("uses Mifflin-St Jeor and macro rules for maintenance", () => {
    expect(calculateUserNutritionTargets({ age: 30, sex: "male", heightCm: 180, weightKg: 80, goal: "maintain", activityLevel: "medium" })).toEqual({
      targetCalories: 2581,
      targetProteinG: 144,
      targetCarbsG: 357,
      targetFatG: 64,
    });
  });

  it("applies fat loss deficit and calculates remaining carbs", () => {
    expect(calculateUserNutritionTargets({ age: 45, sex: "female", heightCm: 150, weightKg: 40, goal: "lose_fat", activityLevel: "low" })).toEqual({
      targetCalories: 742,
      targetProteinG: 80,
      targetCarbsG: 34,
      targetFatG: 32,
    });
  });

  it("clamps negative remaining carbs to zero", () => {
    expect(calculateUserNutritionTargets({ age: 80, sex: "female", heightCm: 130, weightKg: 40, goal: "lose_fat", activityLevel: "low" })).toEqual({
      targetCalories: 382,
      targetProteinG: 80,
      targetCarbsG: 0,
      targetFatG: 32,
    });
  });
});
