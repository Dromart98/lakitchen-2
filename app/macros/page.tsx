import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { MacroMealRecorder } from "@/components/macros/MacroMealRecorder";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { remainingMacros, sumMacros } from "@/modules/meals/meal-summary";
import { getMealBuilderMessage, type MealBuilderInventoryItem } from "@/modules/meals/meal-builder";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";

export const dynamic = "force-dynamic";

type ProfileRow = {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
};

type MealRow = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function getGoal(profile: ProfileRow | null): MacroTotals | null {
  if (!profile) return null;
  const { target_calories: calories, target_protein_g: proteinG, target_carbs_g: carbsG, target_fat_g: fatG } = profile;
  if (calories === null || proteinG === null || carbsG === null || fatG === null) return null;
  return { calories, proteinG, carbsG, fatG };
}

function getMessage(code: string | undefined, success: boolean) {
  if (success && code === "meal-created") return "Comida registrada correctamente.";
  if (!success && code === "meal-name-required") return "Escribe un nombre para la comida.";
  if (!success && code === "meal-name-too-long") return "El nombre de la comida no puede superar los 120 caracteres.";
  if (!success && code === "invalid-macros") return "Los macros deben ser números enteros de 0 o más.";
  if (!success && code === "invalid-calories") return "Corrige las calorías: deben ser un número de 0 o más.";
  if (!success && code === "invalid-protein") return "Corrige la proteína: debe ser un número de 0 o más.";
  if (!success && code === "invalid-carbs") return "Corrige los carbohidratos: deben ser un número de 0 o más.";
  if (!success && code === "invalid-fat") return "Corrige las grasas: deben ser un número de 0 o más.";
  if (!success && code === "invalid-meal-type") return "Selecciona un tipo de comida válido.";
  if (!success && code === "save-failed") return "No se pudo guardar la comida. Inténtalo de nuevo.";
  return null;
}

function MacroRow({ label, consumed, goal, remaining, unit }: { label: string; consumed: number; goal: number; remaining: number; unit: string }) {
  const safeGoal = Number.isFinite(goal) ? Math.max(0, goal) : 0;
  const safeConsumed = Number.isFinite(consumed) ? Math.max(0, consumed) : 0;
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const progress = safeGoal > 0 ? Math.min(100, Math.round((safeConsumed / safeGoal) * 100)) : 0;

  return (
    <div className="macros-progress__row">
      <div className="macros-progress__heading">
        <strong>{label}</strong>
        <span>{safeConsumed} / {safeGoal} {unit} · quedan {safeRemaining} {unit}</span>
      </div>
      <progress className="progress macro-progress__bar" value={progress} max="100">{progress}%</progress>
    </div>
  );
}

export default async function MacrosPage({ searchParams }: { searchParams?: Promise<{ mealError?: string; mealSuccess?: string; mealMode?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "macros page");
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: profile, error: profileError }, { data: meals, error: mealsError }, { data: inventoryItems, error: inventoryError }] = await Promise.all([
    (supabase as any).from("user_nutrition_profiles")
      .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
      .eq("user_id", user.id).maybeSingle() as Promise<{ data: ProfileRow | null; error: { message: string } | null }>,
    (supabase as any).from("daily_meal_logs")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id).eq("consumed_on", today) as Promise<{ data: MealRow[] | null; error: { message: string } | null }>,
    (supabase as any).from("inventory_items")
      .select("id, name, quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id)
      .gt("quantity", 0)
      .order("name", { ascending: true }) as Promise<{ data: MealBuilderInventoryItem[] | null; error: { message: string } | null }>,
  ]);

  if (profileError) console.warn("Supabase could not load the macros nutrition profile:", profileError.message);
  if (mealsError) console.warn("Supabase could not load today's macros meal logs:", mealsError.message);
  if (inventoryError) console.warn("Supabase could not load the macros inventory items:", inventoryError.message);

  const goal = profileError ? null : getGoal(profile);
  const consumed = sumMacros((mealsError ? [] : meals ?? []).map((meal) => ({
    calories: meal.calories, proteinG: meal.protein_g, carbsG: meal.carbs_g, fatG: meal.fat_g,
  })));
  const remaining = goal ? remainingMacros(goal, consumed) : null;
  const params = await searchParams;
  const ingredientsMode = params?.mealMode === "ingredients";
  const manualErrorMessage = ingredientsMode ? null : getMessage(params?.mealError, false);
  const manualSuccessMessage = ingredientsMode ? null : getMessage(params?.mealSuccess, true);
  const ingredientErrorMessage = ingredientsMode ? getMealBuilderMessage(params?.mealError, false) : null;
  const ingredientSuccessMessage = ingredientsMode ? getMealBuilderMessage(params?.mealSuccess, true) : null;

  return (
    <AppShell>
      <div className="macros-page">
        <header className="macros-header">
          <div>
            <span className="macros-eyebrow">Macros</span>
            <h1>Tu alimentación de hoy</h1>
            <p>Revisa y registra las calorías y macronutrientes que consumes durante el día.</p>
          </div>
          <nav className="macros-header__links" aria-label="Consultas de macros">
            <Link href="/meal-history">Ver historial</Link>
            <Link href="/weekly-summary">Resumen semanal</Link>
          </nav>
        </header>

        {profileError || mealsError ? <p className="auth-message error" role="alert">No se pudieron cargar todos tus datos. Inténtalo de nuevo.</p> : null}

        {goal && remaining ? (
          <section className="card macros-progress" aria-labelledby="macros-today-title">
            <h2 id="macros-today-title">Macros de hoy</h2>
            <MacroRow label="Calorías" consumed={consumed.calories} goal={goal.calories} remaining={remaining.calories} unit="kcal" />
            <MacroRow label="Proteína" consumed={consumed.proteinG} goal={goal.proteinG} remaining={remaining.proteinG} unit="g" />
            <MacroRow label="Carbohidratos" consumed={consumed.carbsG} goal={goal.carbsG} remaining={remaining.carbsG} unit="g" />
            <MacroRow label="Grasas" consumed={consumed.fatG} goal={goal.fatG} remaining={remaining.fatG} unit="g" />
          </section>
        ) : (
          <section className="card macros-empty">
            <h2>Configura tus objetivos diarios</h2>
            <p className="muted">Completa tu perfil nutricional para comparar el consumo de hoy con tus objetivos reales.</p>
            <Link className="button" href="/nutrition-profile">Configurar perfil nutricional</Link>
          </section>
        )}

        <div className="macros-lower-grid">
          <MacroMealRecorder
            items={inventoryError ? [] : inventoryItems ?? []}
            initialMode={ingredientsMode ? "ingredients" : "manual"}
            inventoryUnavailable={Boolean(inventoryError)}
            manualErrorMessage={manualErrorMessage}
            manualSuccessMessage={manualSuccessMessage}
            ingredientErrorMessage={ingredientErrorMessage}
            ingredientSuccessMessage={ingredientSuccessMessage}
          />

          <section className="card macros-goals" aria-labelledby="macros-goals-title">
            <h2 id="macros-goals-title">Objetivos diarios</h2>
            {goal ? <dl><div><dt>Calorías</dt><dd>{goal.calories} kcal</dd></div><div><dt>Proteína</dt><dd>{goal.proteinG} g</dd></div><div><dt>Carbohidratos</dt><dd>{goal.carbsG} g</dd></div><div><dt>Grasas</dt><dd>{goal.fatG} g</dd></div></dl> : <p className="muted">No hay objetivos nutricionales completos guardados.</p>}
            <Link className="button" href="/nutrition-profile">Calcular o editar objetivos</Link>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
