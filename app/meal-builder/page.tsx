import Link from "next/link";

import { InventoryMealBuilder } from "@/components/meals/InventoryMealBuilder";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createRepeatedMealBuilderDraft,
  type MealBuilderInventoryItem,
  type RepeatedMealBuilderDraft,
  type RepeatedMealBuilderMeal,
  type RepeatedMealBuilderSnapshot,
} from "@/modules/meals/meal-builder";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPEAT_MEAL_LOAD_ERROR = "No se pudo cargar esta comida para repetirla.";

type InventoryItemsQueryResult = {
  data: MealBuilderInventoryItem[] | null;
  error: { message: string } | null;
};

type RepeatMealQueryResult = {
  data: RepeatedMealBuilderMeal | null;
  error: { message: string; code?: string } | null;
};

type RepeatMealSnapshotsQueryResult = {
  data: RepeatedMealBuilderSnapshot[] | null;
  error: { message: string } | null;
};

export default async function MealBuilderPage({ searchParams }: { searchParams?: Promise<{ repeatMeal?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "meal builder");
  const resolvedSearchParams = await searchParams;
  const repeatMeal = resolvedSearchParams?.repeatMeal?.trim() ?? "";
  let repeatMealDraft: RepeatedMealBuilderDraft | null = null;
  let repeatMealMessage: string | null = null;
  let repeatMealLoaded = false;

  const { data: inventoryItems, error } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, unit, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .gt("quantity", 0)
    .order("name", { ascending: true }) as InventoryItemsQueryResult;

  if (error) {
    console.warn("Supabase could not load the meal builder inventory items:", error.message);
  }

  const availableInventoryItems = error ? [] : inventoryItems ?? [];

  if (repeatMeal) {
    if (!UUID_PATTERN.test(repeatMeal)) {
      repeatMealMessage = "El enlace para repetir esta comida no es válido.";
    } else {
      const { data: meal, error: mealError } = await (supabase as any)
        .from("daily_meal_logs")
        .select("name, meal_type")
        .eq("id", repeatMeal)
        .eq("user_id", user.id)
        .maybeSingle() as RepeatMealQueryResult;

      if (mealError) {
        console.warn("Supabase could not load the repeated meal:", mealError.message);
        repeatMealMessage = REPEAT_MEAL_LOAD_ERROR;
      } else if (!meal) {
        repeatMealMessage = REPEAT_MEAL_LOAD_ERROR;
      } else {
        const { data: snapshots, error: snapshotsError } = await (supabase as any)
          .from("daily_meal_log_items")
          .select("source_inventory_item_id, product_name, consumed_quantity, unit")
          .eq("meal_log_id", repeatMeal)
          .eq("user_id", user.id)
          .order("product_name", { ascending: true })
          .order("source_inventory_item_id", { ascending: true }) as RepeatMealSnapshotsQueryResult;

        if (snapshotsError) {
          console.warn("Supabase could not load the repeated meal snapshots:", snapshotsError.message);
          repeatMealMessage = REPEAT_MEAL_LOAD_ERROR;
        } else if (!snapshots?.length) {
          repeatMealMessage = REPEAT_MEAL_LOAD_ERROR;
        } else {
          repeatMealDraft = createRepeatedMealBuilderDraft(meal, snapshots, availableInventoryItems);
          repeatMealLoaded = true;
        }
      }
    }
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

      {repeatMealMessage ? (
        <p className="auth-message error" role="alert">
          {repeatMealMessage}
        </p>
      ) : null}

      {repeatMealLoaded ? (
        <p className="auth-message success" role="status">
          Comida anterior cargada. Revisa las cantidades antes de confirmar.
        </p>
      ) : null}

      {error ? (
        <p className="auth-message error" role="alert">
          No se pudo cargar tu inventario. Inténtalo de nuevo.
        </p>
      ) : null}

      <InventoryMealBuilder
        key={repeatMeal || "new-meal"}
        items={availableInventoryItems}
        initialMealName={repeatMealDraft?.mealName}
        initialMealType={repeatMealDraft?.mealType}
        initialRows={repeatMealDraft?.availableLines}
        unavailableItems={repeatMealDraft?.unavailableItems}
      />
    </main>
  );
}
