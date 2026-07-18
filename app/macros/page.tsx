import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { addMealLogAction } from "@/app/dashboard/actions";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { remainingMacros, sumMacros } from "@/modules/meals/meal-summary";
import { MEAL_TYPE_LABELS, MEAL_TYPES } from "@/modules/meals/meal-types";
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

export default async function MacrosPage({ searchParams }: { searchParams?: Promise<{ mealError?: string; mealSuccess?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "macros page");
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: profile, error: profileError }, { data: meals, error: mealsError }] = await Promise.all([
    (supabase as any).from("user_nutrition_profiles")
      .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
      .eq("user_id", user.id).maybeSingle() as Promise<{ data: ProfileRow | null; error: { message: string } | null }>,
    (supabase as any).from("daily_meal_logs")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id).eq("consumed_on", today) as Promise<{ data: MealRow[] | null; error: { message: string } | null }>,
  ]);

  if (profileError) console.warn("Supabase could not load the macros nutrition profile:", profileError.message);
  if (mealsError) console.warn("Supabase could not load today's macros meal logs:", mealsError.message);

  const goal = profileError ? null : getGoal(profile);
  const consumed = sumMacros((mealsError ? [] : meals ?? []).map((meal) => ({
    calories: meal.calories, proteinG: meal.protein_g, carbsG: meal.carbs_g, fatG: meal.fat_g,
  })));
  const remaining = goal ? remainingMacros(goal, consumed) : null;
  const params = await searchParams;
  const errorMessage = getMessage(params?.mealError, false);
  const successMessage = getMessage(params?.mealSuccess, true);

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
          <section className="card macros-add" aria-labelledby="macros-add-title">
            <h2 id="macros-add-title">Añadir comida</h2>
            <div className="macros-modes" aria-label="Modos de registro">
              <span className="macros-mode macros-mode--active">Manual</span>
              <button className="macros-mode" type="button" disabled>Texto IA <small>Próximamente</small></button>
              <button className="macros-mode" type="button" disabled>Foto <small>Próximamente</small></button>
              <Link className="macros-mode" href="/meal-builder">Ingredientes</Link>
            </div>
            <p className="muted macros-ingredients-copy">Elige productos de tu inventario y calcula la comida antes de registrarla.</p>
            {errorMessage ? <p className="auth-message error" role="alert">{errorMessage}</p> : null}
            {successMessage ? <p className="auth-message success" role="status">{successMessage}</p> : null}
            <form action={addMealLogAction} className="meal-log-form macros-meal-form">
              <input type="hidden" name="return_to" value="/macros" />
              <label className="field" htmlFor="macros-meal-name"><span>Nombre</span><input id="macros-meal-name" name="name" type="text" required placeholder="Pollo con arroz" /></label>
              <label className="field" htmlFor="macros-meal-type"><span>Tipo de comida</span><select id="macros-meal-type" name="meal_type" required defaultValue=""><option value="" disabled>Selecciona un tipo</option>{MEAL_TYPES.map((type) => <option key={type} value={type}>{MEAL_TYPE_LABELS[type]}</option>)}</select></label>
              <label className="field" htmlFor="macros-calories"><span>Calorías</span><input id="macros-calories" name="calories" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
              <label className="field" htmlFor="macros-protein"><span>Proteína (g)</span><input id="macros-protein" name="protein_g" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
              <label className="field" htmlFor="macros-carbs"><span>Carbohidratos (g)</span><input id="macros-carbs" name="carbs_g" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
              <label className="field" htmlFor="macros-fat"><span>Grasas (g)</span><input id="macros-fat" name="fat_g" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
              <button className="button macros-submit" type="submit">Registrar comida</button>
            </form>
          </section>

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
