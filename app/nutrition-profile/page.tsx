import Link from "next/link";
import { redirect } from "next/navigation";

import { NutritionProfileForm, type NutritionProfileFormValues } from "@/components/nutrition-profile/NutritionProfileForm";
import { createClient } from "@/lib/supabase/server";

type NutritionProfileRow = {
  age: number | null;
  sex: "male" | "female" | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: "lose_fat" | "maintain" | "gain_muscle" | null;
  activity_level: "low" | "medium" | "high" | null;
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
};

function toNumberOrEmpty(value: number | null) {
  return value ?? "";
}

function getInitialValues(profile: NutritionProfileRow | null): NutritionProfileFormValues {
  return {
    age: toNumberOrEmpty(profile?.age ?? null),
    sex: profile?.sex ?? "male",
    height_cm: toNumberOrEmpty(profile?.height_cm ?? null),
    weight_kg: toNumberOrEmpty(profile?.weight_kg ?? null),
    goal: profile?.goal ?? "maintain",
    activity_level: profile?.activity_level ?? "medium",
    target_calories: toNumberOrEmpty(profile?.target_calories ?? null),
    target_protein_g: toNumberOrEmpty(profile?.target_protein_g ?? null),
    target_carbs_g: toNumberOrEmpty(profile?.target_carbs_g ?? null),
    target_fat_g: toNumberOrEmpty(profile?.target_fat_g ?? null),
  };
}

export default async function NutritionProfilePage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.warn("Supabase could not read the nutrition profile auth user:", userError.message);
  }

  if (!userData.user) redirect("/login");

  const user = userData.user;

  const { data: profile, error } = await (supabase as any)
    .from("user_nutrition_profiles")
    .select("age, sex, height_cm, weight_kg, goal, activity_level, target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: NutritionProfileRow | null; error: { message: string } | null };

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <p className="pill">Perfil nutricional</p>
          <h1>Objetivos diarios</h1>
        </div>
        <Link className="logout-link" href="/dashboard">Volver al dashboard</Link>
      </div>
      <p className="muted">Guarda tus datos básicos para estimar calorías, proteína, carbohidratos y grasas. No se registra comida todavía.</p>
      {error ? <p className="auth-message error" role="alert">Supabase no pudo cargar el perfil: {error.message}</p> : null}
      <NutritionProfileForm initialValues={getInitialValues(profile ?? null)} />
    </main>
  );
}
