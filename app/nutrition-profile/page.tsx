import { NutritionProfileForm, type NutritionProfileFormValues } from "@/components/nutrition-profile/NutritionProfileForm";
import { AppShell } from "@/components/layout/AppShell";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
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

export const dynamic = "force-dynamic";

export default async function NutritionProfilePage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "nutrition profile");

  const { data: profile, error } = await (supabase as any)
    .from("user_nutrition_profiles")
    .select("age, sex, height_cm, weight_kg, goal, activity_level, target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: NutritionProfileRow | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load the nutrition profile row:", error.message);
  }

  return (
    <AppShell>
      <div className="nutrition-profile-page">
        <header className="nutrition-profile-header">
          <p className="nutrition-profile-eyebrow">Perfil nutricional</p>
          <h1>Define tus objetivos</h1>
          <p>Utilizamos estos datos para calcular tus objetivos diarios y personalizar tu plan de comidas.</p>
        </header>
        {error ? <p className="nutrition-profile-errors auth-message error" role="alert">No se pudo cargar el perfil. Inténtalo de nuevo.</p> : null}
        <NutritionProfileForm initialValues={getInitialValues(profile ?? null)} />
      </div>
    </AppShell>
  );
}
