import type { ActivityLevel, Goal, MacroGoals, MacroProfileInput, Sex } from "./nutrition.types";

const activityMultipliers: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const goalAdjustments: Record<Goal, number> = { fat_loss: 0.85, maintenance: 1, muscle_gain: 1.1 };
const defaultSplits: Record<Goal, { proteinPct: number; carbsPct: number; fatPct: number }> = { fat_loss: { proteinPct: 35, carbsPct: 35, fatPct: 30 }, maintenance: { proteinPct: 25, carbsPct: 45, fatPct: 30 }, muscle_gain: { proteinPct: 30, carbsPct: 45, fatPct: 25 } };

export function calculateBmr(input: Pick<MacroProfileInput, "age" | "sex" | "weightKg" | "heightCm">): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  if (input.sex === "male") return Math.round(base + 5);
  if (input.sex === "female") return Math.round(base - 161);
  return Math.round(((base + 5) + (base - 161)) / 2);
}

export function calculateMacroGoals(input: MacroProfileInput): MacroGoals {
  const split = { ...defaultSplits[input.goal], proteinPct: input.proteinPct ?? defaultSplits[input.goal].proteinPct, carbsPct: input.carbsPct ?? defaultSplits[input.goal].carbsPct, fatPct: input.fatPct ?? defaultSplits[input.goal].fatPct };
  const totalPct = split.proteinPct + split.carbsPct + split.fatPct;
  if (Math.round(totalPct) !== 100) throw new Error("Los porcentajes de macros deben sumar 100%.");
  const bmr = calculateBmr(input);
  const tdee = Math.round(bmr * activityMultipliers[input.activityLevel]);
  const calories = Math.max(1200, Math.round(tdee * goalAdjustments[input.goal]));
  return { calories, proteinG: Math.round((calories * split.proteinPct / 100) / 4), carbsG: Math.round((calories * split.carbsPct / 100) / 4), fatG: Math.round((calories * split.fatPct / 100) / 9), ...split, bmr, tdee };
}
