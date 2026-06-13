export type Sex = "male" | "female" | "other";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "fat_loss" | "maintenance" | "muscle_gain";
export type MacroProfileInput = { age: number; sex: Sex; weightKg: number; heightCm: number; activityLevel: ActivityLevel; goal: Goal; proteinPct?: number; carbsPct?: number; fatPct?: number; };
export type MacroGoals = { calories: number; proteinG: number; carbsG: number; fatG: number; proteinPct: number; carbsPct: number; fatPct: number; bmr: number; tdee: number; };
export type MacroTotals = { calories: number; proteinG: number; carbsG: number; fatG: number };
