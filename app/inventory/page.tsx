import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

import { addInventoryItemAction, deleteInventoryItemAction, updateInventoryItemAction } from "./actions";

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

type InventoryPageSearchParams = {
  inventoryError?: string;
  inventorySuccess?: string;
};

const locationLabels: Record<InventoryLocation, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
};

const inventoryErrorMessages: Record<string, string> = {
  "name-required": "El nombre del producto es obligatorio.",
  "name-too-long": "El nombre no puede superar los 120 caracteres.",
  "invalid-location": "Selecciona una ubicación válida.",
  "invalid-quantity": "La cantidad debe ser un número mayor que cero.",
  "invalid-unit": "Selecciona una unidad válida.",
  "invalid-expires-at": "Introduce una fecha de caducidad válida.",
  "save-failed": "No se pudo guardar el producto. Inténtalo de nuevo.",
  "delete-not-found": "Este producto ya no está disponible.",
  "delete-failed": "No se pudo eliminar el producto. Inténtalo de nuevo.",
  "update-not-found": "Este producto ya no está disponible.",
  "update-failed": "No se pudo actualizar el producto. Inténtalo de nuevo.",
};

const inventorySuccessMessages: Record<string, string> = {
  "item-created": "Producto añadido al inventario correctamente.",
  "item-deleted": "Producto eliminado correctamente.",
  "item-updated": "Producto actualizado correctamente.",
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

export default async function InventoryPage({ searchParams }: { searchParams?: Promise<InventoryPageSearchParams> }) {
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
  const resolvedSearchParams = await searchParams;
  const inventoryErrorMessage = resolvedSearchParams?.inventoryError
    ? inventoryErrorMessages[resolvedSearchParams.inventoryError]
    : null;
  const inventorySuccessMessage = resolvedSearchParams?.inventorySuccess
    ? inventorySuccessMessages[resolvedSearchParams.inventorySuccess]
    : null;

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

      <section className="card form-section">
        <h2>Añadir producto</h2>
        <p className="muted">Registra productos en tu despensa, nevera o congelador.</p>
        {inventoryErrorMessage ? <p className="auth-message error" role="alert">{inventoryErrorMessage}</p> : null}
        {inventorySuccessMessage ? <p className="auth-message success" role="status">{inventorySuccessMessage}</p> : null}
        <form action={addInventoryItemAction} className="meal-log-form">
          <label className="field" htmlFor="inventory-name">
            <span>Nombre</span>
            <input id="inventory-name" name="name" type="text" maxLength={120} required placeholder="Arroz integral" />
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
            <input id="inventory-quantity" name="quantity" type="number" min="0.000001" step="any" required placeholder="1" />
          </label>
          <label className="field" htmlFor="inventory-unit">
            <span>Unidad</span>
            <select id="inventory-unit" name="unit" required defaultValue="ud">
              <option value="ud">ud</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
            </select>
          </label>
          <label className="field" htmlFor="inventory-expires-at">
            <span>Caducidad (opcional)</span>
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
                      <details>
                        <summary>Editar</summary>
                        <form action={updateInventoryItemAction} className="meal-log-form">
                          <input name="id" type="hidden" value={item.id} />
                          <label className="field" htmlFor={`inventory-edit-name-${item.id}`}>
                            <span>Nombre</span>
                            <input id={`inventory-edit-name-${item.id}`} name="name" type="text" maxLength={120} required defaultValue={item.name} />
                          </label>
                          <label className="field" htmlFor={`inventory-edit-location-${item.id}`}>
                            <span>Ubicación</span>
                            <select id={`inventory-edit-location-${item.id}`} name="location" required defaultValue={item.location}>
                              <option value="pantry">Despensa</option>
                              <option value="fridge">Nevera</option>
                              <option value="freezer">Congelador</option>
                            </select>
                          </label>
                          <label className="field" htmlFor={`inventory-edit-quantity-${item.id}`}>
                            <span>Cantidad</span>
                            <input id={`inventory-edit-quantity-${item.id}`} name="quantity" type="number" min="0.000001" step="any" required defaultValue={item.quantity} />
                          </label>
                          <label className="field" htmlFor={`inventory-edit-unit-${item.id}`}>
                            <span>Unidad</span>
                            <select id={`inventory-edit-unit-${item.id}`} name="unit" required defaultValue={item.unit}>
                              <option value="ud">ud</option>
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="l">l</option>
                            </select>
                          </label>
                          <label className="field" htmlFor={`inventory-edit-expires-at-${item.id}`}>
                            <span>Caducidad (opcional)</span>
                            <input id={`inventory-edit-expires-at-${item.id}`} name="expires_at" type="date" defaultValue={item.expires_at ?? ""} />
                          </label>
                          <button className="button" type="submit">Guardar cambios</button>
                        </form>
                      </details>
                      <form action={deleteInventoryItemAction} className="meal-log-form">
                        <input name="id" type="hidden" value={item.id} />
                        <button className="button" type="submit">Eliminar</button>
                      </form>
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
