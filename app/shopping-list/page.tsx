import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ShoppingListItemRow = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  is_purchased: boolean;
  created_at: string;
};

function ShoppingListGroup({ items, title }: { items: ShoppingListItemRow[]; title: string }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>
              <br />
              {item.quantity} {item.unit}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No hay productos en esta sección.</p>
      )}
    </div>
  );
}

export default async function ShoppingListPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list");

  const { data, error } = await (supabase as any)
    .schema("public")
    .from("shopping_list_items")
    .select("id, name, quantity, unit, is_purchased, created_at")
    .eq("user_id", user.id)
    .order("is_purchased", { ascending: true })
    .order("created_at", { ascending: false }) as {
      data: ShoppingListItemRow[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not load shopping list items:", error.message);
  }

  const items = error ? [] : data ?? [];
  const pendingItems = items.filter((item) => !item.is_purchased);
  const purchasedItems = items.filter((item) => item.is_purchased);

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <span className="pill">Lista de la compra</span>
          <h1>Mis productos por comprar</h1>
        </div>
        <Link className="logout-link" href="/dashboard">
          Volver al dashboard
        </Link>
      </div>

      {error ? (
        <section className="card" role="alert">
          <h2>No se pudo cargar la lista de la compra</h2>
          <p className="muted">No se pudo cargar la lista de la compra. Inténtalo de nuevo.</p>
        </section>
      ) : items.length === 0 ? (
        <section className="card">
          <h2>Tu lista de la compra está vacía</h2>
          <p className="muted">Todavía no hay productos pendientes ni comprados en tu lista.</p>
        </section>
      ) : (
        <section className="grid cards">
          <ShoppingListGroup items={pendingItems} title="Pendientes" />
          <ShoppingListGroup items={purchasedItems} title="Comprados" />
        </section>
      )}
    </main>
  );
}
