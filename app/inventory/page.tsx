import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type InventoryLocation = "pantry" | "fridge" | "freezer";

type InventoryItemRow = {
  id: string;
  name: string;
  location: InventoryLocation;
  quantity: number;
  unit: string;
  expires_at: string | null;
  created_at: string;
};

type InventoryGroup = {
  location: InventoryLocation;
  label: string;
  items: InventoryItemRow[];
};

const locationLabels: Record<InventoryLocation, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
};

const expirationFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatExpirationDate(expiresAt: string | null) {
  if (!expiresAt) return "Sin fecha de caducidad";

  return expirationFormatter.format(new Date(`${expiresAt}T00:00:00`));
}

function groupInventoryItems(items: InventoryItemRow[]): InventoryGroup[] {
  return (["pantry", "fridge", "freezer"] as const).map((location) => ({
    location,
    label: locationLabels[location],
    items: items.filter((item) => item.location === location),
  }));
}

export default async function InventoryPage() {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, location, quantity, unit, expires_at, created_at")
    .eq("user_id", user.id)
    .order("location", { ascending: true })
    .order("name", { ascending: true })
    .order("created_at", { ascending: true }) as {
      data: InventoryItemRow[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not load inventory items:", error.message);
  }

  const items = error ? [] : data ?? [];
  const groupedItems = groupInventoryItems(items);

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <span className="pill">Inventario</span>
          <h1>Mis productos</h1>
        </div>
        <Link className="logout-link" href="/dashboard">
          Volver al dashboard
        </Link>
      </div>

      {error ? (
        <section className="card" role="alert">
          <h2>No se pudo cargar el inventario</h2>
          <p className="muted">No se pudo cargar el inventario. Inténtalo de nuevo.</p>
        </section>
      ) : items.length === 0 ? (
        <section className="card">
          <h2>Tu inventario está vacío</h2>
          <p className="muted">Todavía no has añadido productos a la despensa, nevera o congelador.</p>
        </section>
      ) : (
        <section className="grid cards">
          {groupedItems.map((group) => (
            <div className="card" key={group.location}>
              <h2>{group.label}</h2>
              {group.items.length ? (
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong>
                      <br />
                      {item.quantity} {item.unit}
                      <br />
                      <span className="muted">{formatExpirationDate(item.expires_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No hay productos en esta ubicación.</p>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
