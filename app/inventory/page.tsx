import Link from "next/link";

import { addInventoryItemAction } from "./actions";
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

function getInventoryErrorMessage(code: string | undefined) {
  if (code === "name-required") return "Escribe el nombre del producto.";
  if (code === "name-too-long") return "El nombre del producto es demasiado largo.";
  if (code === "invalid-location") return "Selecciona una ubicación válida.";
  if (code === "invalid-quantity") return "Introduce una cantidad mayor que cero.";
  if (code === "invalid-unit") return "Selecciona una unidad válida.";
  if (code === "invalid-expiration") return "Introduce una fecha de caducidad válida.";
  if (code === "save-failed") return "No se pudo guardar el producto. Inténtalo de nuevo.";
  return null;
}

function getInventorySuccessMessage(code: string | undefined) {
  if (code === "created") return "Producto añadido correctamente.";
  return null;
}

export default async function InventoryPage({ searchParams }: { searchParams?: Promise<{ inventoryError?: string; inventorySuccess?: string }> }) {
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

  const resolvedSearchParams = await searchParams;
  const inventoryErrorMessage = getInventoryErrorMessage(resolvedSearchParams?.inventoryError);
  const inventorySuccessMessage = inventoryErrorMessage
    ? null
    : getInventorySuccessMessage(resolvedSearchParams?.inventorySuccess);
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

      <section className="card">
        <h2>Añadir producto</h2>
        <p className="muted">Guarda un producto real en tu despensa, nevera o congelador.</p>
        {inventoryErrorMessage ? <p className="auth-message error" role="alert">{inventoryErrorMessage}</p> : null}
        {inventorySuccessMessage ? <p className="auth-message success">{inventorySuccessMessage}</p> : null}
        <form action={addInventoryItemAction} className="form-section">
          <label className="field" htmlFor="inventory-name">
            <span>Nombre</span>
            <input id="inventory-name" name="name" type="text" required maxLength={120} placeholder="Pechuga de pollo" />
          </label>
          <label className="field" htmlFor="inventory-location">
            <span>Ubicación</span>
            <select id="inventory-location" name="location" required defaultValue="pantry">
              <option value="pantry">Despensa</option>
              <option value="fridge">Nevera</option>
              <option value="freezer">Congelador</option>
            </select>
          </label>
          <label className="field" htmlFor="inventory-quantity">
            <span>Cantidad</span>
            <input id="inventory-quantity" name="quantity" type="number" required min="0.000001" step="any" placeholder="1" />
          </label>
          <label className="field" htmlFor="inventory-unit">
            <span>Unidad</span>
            <select id="inventory-unit" name="unit" required defaultValue="ud">
              <option value="ud">Unidades</option>
              <option value="g">Gramos</option>
              <option value="kg">Kilogramos</option>
              <option value="ml">Mililitros</option>
              <option value="l">Litros</option>
            </select>
          </label>
          <label className="field" htmlFor="inventory-expires-at">
            <span>Fecha de caducidad</span>
            <input id="inventory-expires-at" name="expires_at" type="date" />
          </label>
          <button className="button" type="submit">Añadir producto</button>
        </form>
      </section>

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
