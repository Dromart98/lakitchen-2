export type UserNutritionSex = "male" | "female";
export type UserNutritionGoal = "lose_fat" | "maintain" | "gain_muscle";
export type UserNutritionActivityLevel = "low" | "medium" | "high";

export type UserNutritionInput = {
  age: number;
  sex: UserNutritionSex;
  heightCm: number;
  weightKg: number;
  goal: UserNutritionGoal;
  activityLevel: UserNutritionActivityLevel;
};

export type UserNutritionTargets = {
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
};

const activityMultipliers: Record<UserNutritionActivityLevel, number> = {
  low: 1.2,
  medium: 1.45,
  high: 1.7,
};

const calorieAdjustments: Record<UserNutritionGoal, number> = {
  lose_fat: -400,
  maintain: 0,
  gain_muscle: 250,
};

const proteinMultipliers: Record<UserNutritionGoal, number> = {
  lose_fat: 2,
  maintain: 1.8,
  gain_muscle: 2,
};

export function calculateUserNutritionTargets(input: UserNutritionInput): UserNutritionTargets {
  const sexAdjustment = input.sex === "male" ? 5 : -161;
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexAdjustment;
  const maintenanceCalories = bmr * activityMultipliers[input.activityLevel];
  const targetCalories = Math.round(maintenanceCalories + calorieAdjustments[input.goal]);
  const targetProteinG = Math.round(input.weightKg * proteinMultipliers[input.goal]);
  const targetFatG = Math.round(input.weightKg * 0.8);
  const remainingCalories = targetCalories - targetProteinG * 4 - targetFatG * 9;
  const targetCarbsG = Math.max(0, Math.round(remainingCalories / 4));

  return { targetCalories, targetProteinG, targetCarbsG, targetFatG };
}
