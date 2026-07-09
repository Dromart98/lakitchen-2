import Link from "next/link";
import { RecipeSuggestion } from "@/components/dashboard/RecipeSuggestion";
import { ExpiringList } from "@/components/inventory/ExpiringList";
import { MacroProgress } from "@/components/nutrition/MacroProgress";
import { inventory } from "@/lib/demo-data";
import { getExpiringItems } from "@/modules/inventory/inventory.rules";
import { remainingMacros, sumMacros } from "@/modules/meals/meal-summary";
import { addMealLogAction } from "./actions";
import type { MacroTotals } from "@/modules/nutrition/nutrition.types";
import { generateRecipe } from "@/modules/recipes/recipe-generator.service";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type NutritionProfileTargetsRow = {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
};

type DailyMealLogRow = {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
};

function getProfileGoal(profile: NutritionProfileTargetsRow | null): MacroTotals | null {
  if (!profile) return null;

  const { target_calories: calories, target_protein_g: proteinG, target_carbs_g: carbsG, target_fat_g: fatG } = profile;

  if (calories === null || proteinG === null || carbsG === null || fatG === null) {
    return null;
  }

  return { calories, proteinG, carbsG, fatG };
}

export const dynamic = "force-dynamic";

function getMealErrorMessage(code: string | undefined) {
  if (code === "meal-name-required") return "Escribe un nombre para la comida.";
  if (code === "invalid-macros") return "Los macros deben ser números enteros de 0 o más.";
  if (code === "save-failed") return "No se pudo guardar la comida. Inténtalo de nuevo.";
  return null;
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ mealError?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard");

  const { data: profile, error } = await (supabase as any)
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: NutritionProfileTargetsRow | null; error: { message: string } | null };

  const today = new Date().toISOString().slice(0, 10);
  const { data: mealLogs, error: mealLogsError } = await (supabase as any)
    .from("daily_meal_logs")
    .select("id, name, calories, protein_g, carbs_g, fat_g, created_at")
    .eq("user_id", user.id)
    .eq("consumed_on", today)
    .order("created_at", { ascending: false }) as { data: DailyMealLogRow[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load the dashboard nutrition profile:", error.message);
  }

  const mealsToday = mealLogsError ? [] : mealLogs ?? [];
  const consumedToday = sumMacros(mealsToday.map((meal) => ({
    calories: meal.calories,
    proteinG: meal.protein_g,
    carbsG: meal.carbs_g,
    fatG: meal.fat_g,
  })));
  const resolvedSearchParams = await searchParams;
  const mealErrorMessage = getMealErrorMessage(resolvedSearchParams?.mealError);
  const goal = getProfileGoal(profile ?? null);
  const remaining = goal ? remainingMacros(goal, consumedToday) : null;
  const expiring = getExpiringItems(inventory);
  const recipe = remaining ? generateRecipe({ items: inventory, mealType: "dinner", macroTarget: remaining }) : null;

  return (
    <main className="shell">
      <div className="topbar">
        <h1>Lakitchen</h1>
        <form action="/auth/signout" method="post">
          <button className="logout-link" type="submit">Cerrar sesión</button>
        </form>
      </div>

      <p className="muted">Dashboard mobile-first para macros, inventario y recetas.</p>

      <div className="dashboard-actions">
        <Link className="button nav-button" href="/nutrition-profile">
          Configurar perfil nutricional
        </Link>
      </div>

      {error ? (
        <p className="auth-message error" role="alert">
          Supabase no pudo cargar tu perfil nutricional: {error.message}
        </p>
      ) : null}

      {goal && remaining ? (
        <section className="grid cards">
          <MacroProgress consumed={consumedToday} goal={goal} />
          <div className="card">
            <h2>Restante</h2>
            <p>{remaining.calories} kcal</p>
            <p className="muted">
              P {remaining.proteinG}g · C {remaining.carbsG}g · G {remaining.fatG}g
            </p>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Configura tu perfil nutricional</h2>
          <p className="muted">
            Aún no hay objetivos diarios guardados para tu usuario. Completa tu perfil para ver calorías,
            proteína, carbohidratos y grasas personalizados.
          </p>
          <Link className="button nav-button" href="/nutrition-profile">
            Crear perfil nutricional
          </Link>
        </section>
      )}

      <section className="grid cards" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Registro manual rápido</h2>
          <p className="muted">Añade una comida consumida hoy para sumar sus macros al dashboard.</p>
          {mealErrorMessage ? <p className="auth-message error" role="alert">{mealErrorMessage}</p> : null}
          <form action={addMealLogAction} className="meal-log-form">
            <label className="field" htmlFor="meal-name">
              <span>Nombre</span>
              <input id="meal-name" name="name" type="text" required placeholder="Pollo con arroz" />
            </label>
            <label className="field" htmlFor="meal-calories">
              <span>Calorías</span>
              <input id="meal-calories" name="calories" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <label className="field" htmlFor="meal-protein">
              <span>Proteína (g)</span>
              <input id="meal-protein" name="protein_g" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <label className="field" htmlFor="meal-carbs">
              <span>Carbohidratos (g)</span>
              <input id="meal-carbs" name="carbs_g" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <label className="field" htmlFor="meal-fat">
              <span>Grasas (g)</span>
              <input id="meal-fat" name="fat_g" type="number" min="0" step="1" required defaultValue="0" />
            </label>
            <button className="button" type="submit">Registrar comida</button>
          </form>
        </div>

        <div className="card">
          <h2>Comidas registradas hoy</h2>
          {mealsToday.length ? (
            <ul>
              {mealsToday.map((meal) => (
                <li key={meal.id}>
                  <strong>{meal.name}</strong> · {meal.calories} kcal · P {meal.protein_g}g · C {meal.carbs_g}g · G {meal.fat_g}g
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Aún no has registrado comidas hoy.</p>
          )}
        </div>
      </section>

      <section className="grid cards" style={{ marginTop: 16 }}>
        <ExpiringList items={expiring} />
        {recipe ? (
          <RecipeSuggestion recipe={recipe} />
        ) : (
          <div className="card">
            <h2>Receta sugerida</h2>
            <p className="muted">
              Configura tu perfil nutricional para generar una sugerencia con tus macros restantes.
            </p>
          </div>
        )}
      </section>
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Build check: no-meal-error-banner-v1
      </p>
    </main>
  );
}
