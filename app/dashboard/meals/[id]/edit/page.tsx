import Link from "next/link";
import { redirect } from "next/navigation";

import { updateMealLogAction } from "@/app/dashboard/actions";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMealLogId } from "@/modules/meals/meal-validation";
import { MEAL_TYPE_LABELS, MEAL_TYPES, normalizeMealType } from "@/modules/meals/meal-types";

export const dynamic = "force-dynamic";

type MealLogEditRow = {
  id: string;
  name: string;
  meal_type: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function getMealErrorMessage(code: string | undefined) {
  if (code === "meal-name-required") return "Escribe un nombre para la comida.";
  if (code === "meal-name-too-long") return "El nombre de la comida no puede superar los 120 caracteres.";
  if (code === "invalid-meal-type") return "Selecciona un tipo de comida válido.";
  if (code === "invalid-macros") return "Los macros deben ser números enteros de 0 o más.";
  if (code === "update-failed") return "No se pudo actualizar la comida. Inténtalo de nuevo.";
  return null;
}

export default async function EditMealLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mealError?: string }>;
}) {
  const { id } = await params;

  if (!isMealLogId(id)) {
    redirect("/dashboard?mealError=meal-not-found");
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard meal edit");
  const today = new Date().toISOString().slice(0, 10);

  const { data: meal, error } = await (supabase as any)
    .from("daily_meal_logs")
    .select("id, name, meal_type, calories, protein_g, carbs_g, fat_g")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("consumed_on", today)
    .maybeSingle() as { data: MealLogEditRow | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load the meal log for editing:", error.message);
    redirect("/dashboard?mealError=load-edit-failed");
  }

  if (!meal) {
    redirect("/dashboard?mealError=meal-not-found");
  }

  const resolvedSearchParams = await searchParams;
  const mealErrorMessage = getMealErrorMessage(resolvedSearchParams?.mealError);

  return (
    <main className="shell">
      <section className="card">
        <h1>Editar comida</h1>
        <p className="muted">Actualiza los datos de esta comida registrada hoy.</p>
        {mealErrorMessage ? <p className="auth-message error" role="alert">{mealErrorMessage}</p> : null}
        <form action={updateMealLogAction} className="meal-log-form">
          <input type="hidden" name="id" value={meal.id} />
          <label className="field" htmlFor="meal-name">
            <span>Nombre</span>
            <input id="meal-name" name="name" type="text" required maxLength={120} defaultValue={meal.name} />
          </label>
          <label className="field" htmlFor="meal-type">
            <span>Tipo de comida</span>
            <select id="meal-type" name="meal_type" required defaultValue={normalizeMealType(meal.meal_type)}>
              {MEAL_TYPES.map((mealType) => (
                <option key={mealType} value={mealType}>{MEAL_TYPE_LABELS[mealType]}</option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="meal-calories">
            <span>Calorías</span>
            <input id="meal-calories" name="calories" type="number" min="0" step="1" required defaultValue={meal.calories} />
          </label>
          <label className="field" htmlFor="meal-protein">
            <span>Proteína (g)</span>
            <input id="meal-protein" name="protein_g" type="number" min="0" step="1" required defaultValue={meal.protein_g} />
          </label>
          <label className="field" htmlFor="meal-carbs">
            <span>Carbohidratos (g)</span>
            <input id="meal-carbs" name="carbs_g" type="number" min="0" step="1" required defaultValue={meal.carbs_g} />
          </label>
          <label className="field" htmlFor="meal-fat">
            <span>Grasas (g)</span>
            <input id="meal-fat" name="fat_g" type="number" min="0" step="1" required defaultValue={meal.fat_g} />
          </label>
          <div className="dashboard-actions">
            <button className="button" type="submit">Guardar cambios</button>
            <Link className="button nav-button" href="/dashboard">Cancelar</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
