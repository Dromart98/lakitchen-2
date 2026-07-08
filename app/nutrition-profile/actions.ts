"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { calculateUserNutritionTargets, type UserNutritionActivityLevel, type UserNutritionGoal, type UserNutritionSex } from "@/modules/user-nutrition/calculator";

export type NutritionProfileActionState = { error?: string; message?: string };

type NutritionProfilePayload = {
  age: number;
  sex: UserNutritionSex;
  height_cm: number;
  weight_kg: number;
  goal: UserNutritionGoal;
  activity_level: UserNutritionActivityLevel;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
};

const sexes = ["male", "female"] as const;
const goals = ["lose_fat", "maintain", "gain_muscle"] as const;
const activityLevels = ["low", "medium", "high"] as const;

function numberFromForm(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : NaN;
}

function getPayload(formData: FormData): NutritionProfilePayload | { error: string } {
  const age = numberFromForm(formData, "age");
  const heightCm = numberFromForm(formData, "height_cm");
  const weightKg = numberFromForm(formData, "weight_kg");
  const sex = String(formData.get("sex") ?? "");
  const goal = String(formData.get("goal") ?? "");
  const activityLevel = String(formData.get("activity_level") ?? "");

  if (!Number.isInteger(age) || age < 13 || age > 120) return { error: "Introduce una edad válida entre 13 y 120 años." };
  if (!sexes.includes(sex as UserNutritionSex)) return { error: "Selecciona un sexo válido." };
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) return { error: "Introduce una altura válida en centímetros." };
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) return { error: "Introduce un peso válido en kilogramos." };
  if (!goals.includes(goal as UserNutritionGoal)) return { error: "Selecciona un objetivo válido." };
  if (!activityLevels.includes(activityLevel as UserNutritionActivityLevel)) return { error: "Selecciona un nivel de actividad válido." };

  const calculated = calculateUserNutritionTargets({ age, sex: sex as UserNutritionSex, heightCm, weightKg, goal: goal as UserNutritionGoal, activityLevel: activityLevel as UserNutritionActivityLevel });

  return {
    age,
    sex: sex as UserNutritionSex,
    height_cm: heightCm,
    weight_kg: weightKg,
    goal: goal as UserNutritionGoal,
    activity_level: activityLevel as UserNutritionActivityLevel,
    target_calories: Math.round(numberFromForm(formData, "target_calories") || calculated.targetCalories),
    target_protein_g: Math.round(numberFromForm(formData, "target_protein_g") || calculated.targetProteinG),
    target_carbs_g: Math.round(numberFromForm(formData, "target_carbs_g") || calculated.targetCarbsG),
    target_fat_g: Math.round(numberFromForm(formData, "target_fat_g") || calculated.targetFatG),
  };
}

export async function saveNutritionProfileAction(formData: FormData): Promise<NutritionProfileActionState> {
  const payload = getPayload(formData);
  if ("error" in payload) return { error: payload.error };

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Debes iniciar sesión para guardar tu perfil nutricional." };

  const { error } = await (supabase as any).from("user_nutrition_profiles").upsert({ ...payload, user_id: userData.user.id }, { onConflict: "user_id" });
  if (error) return { error: `Supabase no pudo guardar el perfil: ${error.message}` };

  revalidatePath("/nutrition-profile");
  revalidatePath("/dashboard");
  return { message: "Perfil nutricional guardado correctamente." };
}
