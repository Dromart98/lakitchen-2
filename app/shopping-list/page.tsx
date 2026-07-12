import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

import {
  addShoppingListItemAction,
  deleteShoppingListItemAction,
  setShoppingListItemPurchasedAction,
  updateShoppingListItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

type ShoppingListItemRow = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  is_purchased: boolean;
  created_at: string;
};

type ShoppingListPageSearchParams = {
  shoppingListError?: string;
  shoppingListSuccess?: string;
};

const shoppingListErrorMessages: Record<string, string> = {
  "name-required": "El nombre del producto es obligatorio.",
  "name-too-long": "El nombre no puede superar los 120 caracteres.",
  "invalid-quantity": "La cantidad debe ser un número mayor que cero.",
  "invalid-unit": "Selecciona una unidad válida.",
  "item-not-found": "Este producto ya no está disponible.",
  "save-failed": "No se pudo guardar el producto. Inténtalo de nuevo.",
  "update-failed": "No se pudo actualizar el producto. Inténtalo de nuevo.",
  "delete-failed": "No se pudo eliminar el producto. Inténtalo de nuevo.",
};

const shoppingListSuccessMessages: Record<string, string> = {
  "item-created": "Producto añadido a la lista correctamente.",
  "item-purchased": "Producto marcado como comprado.",
  "item-pending": "Producto devuelto a pendientes.",
  "item-deleted": "Producto eliminado correctamente.",
  "item-updated": "Producto actualizado correctamente.",
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
              <form action={setShoppingListItemPurchasedAction} className="meal-log-form">
                <input name="id" type="hidden" value={item.id} />
                <input name="is_purchased" type="hidden" value={item.is_purchased ? "false" : "true"} />
                <button className="button" type="submit">
                  {item.is_purchased ? "Volver a pendientes" : "Marcar como comprado"}
                </button>
              </form>
              <form action={deleteShoppingListItemAction} className="meal-log-form">
                <input name="id" type="hidden" value={item.id} />
                <button className="button" type="submit">Eliminar</button>
              </form>
              <details>
                <summary>Editar</summary>
                <form action={updateShoppingListItemAction} className="meal-log-form">
                  <input name="id" type="hidden" value={item.id} />
                  <label className="field" htmlFor={`shopping-list-name-${item.id}`}>
                    <span>Nombre</span>
                    <input
                      id={`shopping-list-name-${item.id}`}
                      name="name"
                      type="text"
                      maxLength={120}
                      required
                      defaultValue={item.name}
                    />
                  </label>
                  <label className="field" htmlFor={`shopping-list-quantity-${item.id}`}>
                    <span>Cantidad</span>
                    <input
                      id={`shopping-list-quantity-${item.id}`}
                      name="quantity"
                      type="number"
                      min="0.000001"
                      step="any"
                      required
                      defaultValue={item.quantity}
                    />
                  </label>
                  <label className="field" htmlFor={`shopping-list-unit-${item.id}`}>
                    <span>Unidad</span>
                    <select id={`shopping-list-unit-${item.id}`} name="unit" required defaultValue={item.unit}>
                      <option value="ud">ud</option>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                    </select>
                  </label>
                  <button className="button" type="submit">Guardar cambios</button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No hay productos en esta sección.</p>
      )}
    </div>
  );
}

export default async function ShoppingListPage({
  searchParams,
}: {
  searchParams?: Promise<ShoppingListPageSearchParams>;
}) {
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
  const resolvedSearchParams = await searchParams;
  const shoppingListErrorMessage = resolvedSearchParams?.shoppingListError
    ? shoppingListErrorMessages[resolvedSearchParams.shoppingListError]
    : null;
  const shoppingListSuccessMessage = resolvedSearchParams?.shoppingListSuccess
    ? shoppingListSuccessMessages[resolvedSearchParams.shoppingListSuccess]
    : null;

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

      <section className="card form-section">
        <h2>Añadir producto</h2>
        <p className="muted">Añade los productos que necesitas comprar.</p>
        {shoppingListErrorMessage ? <p className="auth-message error" role="alert">{shoppingListErrorMessage}</p> : null}
        {shoppingListSuccessMessage ? <p className="auth-message success" role="status">{shoppingListSuccessMessage}</p> : null}
        <form action={addShoppingListItemAction} className="meal-log-form">
          <label className="field" htmlFor="shopping-list-name">
            <span>Nombre</span>
            <input id="shopping-list-name" name="name" type="text" maxLength={120} required placeholder="Huevos" />
          </label>
          <label className="field" htmlFor="shopping-list-quantity">
            <span>Cantidad</span>
            <input id="shopping-list-quantity" name="quantity" type="number" min="0.000001" step="any" required defaultValue="1" />
          </label>
          <label className="field" htmlFor="shopping-list-unit">
            <span>Unidad</span>
            <select id="shopping-list-unit" name="unit" required defaultValue="ud">
              <option value="ud">ud</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
            </select>
          </label>
          <button className="button" type="submit">Añadir a la lista</button>
        </form>
      </section>

      {error ? (
        <section className="card" role="alert">
          <h2>No se pudo cargar la lista de la compra</h2>
          <p className="muted">No se pudo cargar la lista de la compra. Inténtalo de nuevo.</p>
        </section>
      ) : items.length === 0 ? (
        <section className="card">
          <h2>Tu lista de la compra está vacía</h2>
          <p className="muted">Añade tu primer producto para empezar.</p>
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
