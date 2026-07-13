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

type MealBuilderPageProps = {
  searchParams?: Promise<{ mealError?: string; mealSuccess?: string }>;
};

const MEAL_ERROR_MESSAGES: Record<string, string> = {
  "invalid-name": "El nombre de la comida es obligatorio y no puede superar 120 caracteres.",
  "invalid-meal-type": "Selecciona un tipo de comida válido.",
  "invalid-lines-json": "No se pudo leer la selección de productos. Revisa la comida e inténtalo de nuevo.",
  "invalid-lines": "Añade al menos un producto válido a la comida.",
  "too-many-products": "La comida no puede contener más de diez productos.",
  "duplicate-product": "No puedes registrar el mismo producto más de una vez en la misma comida.",
  "product-not-found": "Uno de los productos ya no está disponible en tu inventario.",
  "invalid-quantity": "Revisa las cantidades de los productos.",
  "quantity-too-high": "Una cantidad supera el stock disponible actual.",
  "incomplete-nutrition": "Uno de los productos no tiene nutrición completa.",
  "incompatible-unit": "Uno de los productos tiene una unidad incompatible con su base nutricional.",
  "consume-failed": "No se pudo registrar la comida. Inténtalo de nuevo.",
};

const MEAL_SUCCESS_MESSAGES: Record<string, string> = {
  "meal-consumed-logged": "Comida registrada y productos descontados correctamente.",
};

export default async function MealBuilderPage({ searchParams }: MealBuilderPageProps) {
  const params = await searchParams;
  const mealErrorMessage = params?.mealError ? MEAL_ERROR_MESSAGES[params.mealError] : null;
  const mealSuccessMessage = params?.mealSuccess ? MEAL_SUCCESS_MESSAGES[params.mealSuccess] : null;
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
        Selecciona productos de tu inventario para previsualizar calorías y macros. El inventario solo se descuenta cuando confirmas la comida.
      </p>

      <div className="dashboard-actions">
        <Link className="button nav-button" href="/dashboard">Dashboard</Link>
        <Link className="button nav-button" href="/inventory">Inventario</Link>
      </div>

      {mealSuccessMessage ? (
        <p className="auth-message success" role="status">
          {mealSuccessMessage}
        </p>
      ) : null}

      {mealErrorMessage ? (
        <p className="auth-message error" role="alert">
          {mealErrorMessage}
        </p>
      ) : null}

      {error ? (
        <p className="auth-message error" role="alert">
          No se pudo cargar tu inventario. Inténtalo de nuevo.
        </p>
      ) : null}

      <InventoryMealBuilder items={error ? [] : inventoryItems ?? []} />
    </main>
  );
}
