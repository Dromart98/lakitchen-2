import Link from "next/link";

import { InventoryMealBuilder } from "@/components/meals/InventoryMealBuilder";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { MealBuilderInventoryItem } from "@/modules/meals/meal-builder";

export const dynamic = "force-dynamic";

type InventoryItemsQueryResult = {
  data: MealBuilderInventoryItem[] | null;
  error: { message: string } | null;
};

export default async function MealBuilderPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "meal builder");

  const { data: inventoryItems, error } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .gt("quantity", 0)
    .order("name", { ascending: true }) as InventoryItemsQueryResult;

  if (error) {
    console.warn("Supabase could not load the meal builder inventory items:", error.message);
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <p className="pill">Previsualización</p>
          <h1>Componer comida</h1>
        </div>
        <Link className="logout-link" href="/dashboard">Volver al dashboard</Link>
      </div>

      <p className="muted">
        Selecciona productos de tu inventario para previsualizar calorías y macros. En esta fase no se descuenta inventario ni se guarda ninguna comida.
      </p>

      <div className="dashboard-actions">
        <Link className="button nav-button" href="/dashboard">Dashboard</Link>
        <Link className="button nav-button" href="/inventory">Inventario</Link>
      </div>

      {error ? (
        <p className="auth-message error" role="alert">
          No se pudo cargar tu inventario. Inténtalo de nuevo.
        </p>
      ) : null}

      <InventoryMealBuilder items={error ? [] : inventoryItems ?? []} />
    </main>
  );
}
