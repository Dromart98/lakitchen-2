import Link from "next/link";
import { RecipeSuggestion } from "@/components/dashboard/RecipeSuggestion";
import { ExpiringList } from "@/components/inventory/ExpiringList";
import { MacroProgress } from "@/components/nutrition/MacroProgress";
import { inventory } from "@/lib/demo-data";
import { getExpiringItems } from "@/modules/inventory/inventory.rules";
import { remainingMacros } from "@/modules/meals/meal-summary";
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

function getProfileGoal(profile: NutritionProfileTargetsRow | null): MacroTotals | null {
  if (!profile) return null;

  const { target_calories: calories, target_protein_g: proteinG, target_carbs_g: carbsG, target_fat_g: fatG } = profile;

  if (calories === null || proteinG === null || carbsG === null || fatG === null) {
    return null;
  }

  return { calories, proteinG, carbsG, fatG };
}

const emptyConsumedToday: MacroTotals = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "dashboard");

  const { data: profile, error } = await (supabase as any)
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", user.id)
    .maybeSingle() as { data: NutritionProfileTargetsRow | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not load the dashboard nutrition profile:", error.message);
  }

  const goal = getProfileGoal(profile ?? null);
  const remaining = goal ? remainingMacros(goal, emptyConsumedToday) : null;
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
          <MacroProgress consumed={emptyConsumedToday} goal={goal} />
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
    </main>
  );
}
