import Link from "next/link";
import { RecipeSuggestion } from "@/components/dashboard/RecipeSuggestion";
import { ExpiringList } from "@/components/inventory/ExpiringList";
import { MacroProgress } from "@/components/nutrition/MacroProgress";
import { consumedToday, inventory, todayGoal } from "@/lib/demo-data";
import { getExpiringItems } from "@/modules/inventory/inventory.rules";
import { remainingMacros } from "@/modules/meals/meal-summary";
import { generateRecipe } from "@/modules/recipes/recipe-generator.service";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "dashboard");

  const remaining = remainingMacros(todayGoal, consumedToday);
  const expiring = getExpiringItems(inventory);
  const recipe = generateRecipe({ items: inventory, mealType: "dinner", macroTarget: remaining });
  return <main className="shell"><div className="topbar"><h1>Lakitchen</h1><Link className="logout-link" href="/auth/signout">Cerrar sesión</Link></div><p className="muted">Dashboard mobile-first para macros, inventario y recetas.</p><div className="dashboard-actions"><Link className="button nav-button" href="/nutrition-profile">Configurar perfil nutricional</Link></div><section className="grid cards"><MacroProgress consumed={consumedToday} goal={todayGoal}/><div className="card"><h2>Restante</h2><p>{remaining.calories} kcal</p><p className="muted">P {remaining.proteinG}g · C {remaining.carbsG}g · G {remaining.fatG}g</p></div></section><section className="grid cards" style={{marginTop:16}}><ExpiringList items={expiring}/><RecipeSuggestion recipe={recipe}/></section></main>;
}
