import { AppShell } from "@/components/layout/AppShell";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { VoiceShoppingBatchInput } from "@/components/shopping/VoiceShoppingBatchInput";

import {
  addShoppingListItemAction,
  deleteShoppingListItemAction,
  setShoppingListItemPurchasedAction,
  transferShoppingListItemToInventoryAction,
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
  "transfer-unavailable": "Este producto no está disponible para transferir.",
  "invalid-expires-at": "Introduce una fecha de caducidad válida.",
  "invalid-location": "Selecciona una ubicación válida.",
  "save-failed": "No se pudo guardar el producto. Inténtalo de nuevo.",
  "update-failed": "No se pudo actualizar el producto. Inténtalo de nuevo.",
  "delete-failed": "No se pudo eliminar el producto. Inténtalo de nuevo.",
  "transfer-failed": "No se pudo añadir el producto al inventario. Inténtalo de nuevo.",
};

const shoppingListSuccessMessages: Record<string, string> = {
  "item-created": "Producto añadido a la lista correctamente.",
  "item-purchased": "Producto marcado como comprado.",
  "item-pending": "Producto devuelto a pendientes.",
  "item-deleted": "Producto eliminado correctamente.",
  "item-updated": "Producto actualizado correctamente.",
  "item-transferred": "Producto añadido al inventario correctamente.",
  "item-transferred-with-nutrition": "Producto añadido al inventario con los macros calculados automáticamente.",
  "item-transferred-macros-pending": "Producto añadido al inventario. No se pudieron completar los macros automáticamente; puedes revisarlos desde el inventario.",
};

function ShoppingListGroup({ items, title }: { items: ShoppingListItemRow[]; title: string }) {
  const headingId = `shopping-list-group-${title.toLocaleLowerCase("es-ES")}`;

  return (
    <section className="shopping-list-group" aria-labelledby={headingId}>
      <div className="shopping-list-group__heading">
        <h2 id={headingId}>{title}</h2>
        <span>{items.length} productos</span>
      </div>
      {items.length ? (
        <ul className="shopping-list-items">
          {items.map((item) => (
            <li className={`shopping-list-item${item.is_purchased ? " shopping-list-item--purchased" : ""}`} key={item.id}>
              <div className="shopping-list-item__heading">
                <div>
                  <h3>{item.name}</h3>
                  <p className="shopping-list-item__quantity">{item.quantity} {item.unit}</p>
                </div>
                <span className="shopping-list-item__status">
                  {item.is_purchased ? "Comprado" : "Pendiente"}
                </span>
              </div>

              <div className="shopping-list-item__actions">
                <form action={setShoppingListItemPurchasedAction}>
                  <input name="id" type="hidden" value={item.id} />
                  <input name="is_purchased" type="hidden" value={item.is_purchased ? "false" : "true"} />
                  <button className={item.is_purchased ? "shopping-list-item__secondary" : "button"} type="submit">
                    {item.is_purchased ? "Volver a pendientes" : "Marcar como comprado"}
                  </button>
                </form>
                <form action={deleteShoppingListItemAction} className="shopping-list-item__delete">
                  <input name="id" type="hidden" value={item.id} />
                  <button type="submit">Eliminar</button>
                </form>
              </div>

              {item.is_purchased ? (
                <details className="shopping-list-item__details shopping-list-item__details--transfer">
                  <summary>Pasar al inventario</summary>
                  <form action={transferShoppingListItemToInventoryAction} className="shopping-list-item__transfer-form">
                    <input name="id" type="hidden" value={item.id} />
                    <label className="field" htmlFor={`shopping-list-transfer-location-${item.id}`}>
                      <span>Ubicación</span>
                      <select id={`shopping-list-transfer-location-${item.id}`} name="location" required defaultValue="pantry">
                        <option value="pantry">Despensa</option>
                        <option value="fridge">Nevera</option>
                        <option value="freezer">Congelador</option>
                      </select>
                    </label>
                    <label className="field" htmlFor={`shopping-list-transfer-expires-at-${item.id}`}>
                      <span>Fecha de caducidad opcional</span>
                      <input id={`shopping-list-transfer-expires-at-${item.id}`} name="expires_at" type="date" />
                    </label>
                    <p>Lakitchenapp intentará completar los macros automáticamente. Si no puede, el producto se añadirá igualmente.</p>
                    <button className="button" type="submit">Añadir al inventario y calcular macros</button>
                  </form>
                </details>
              ) : null}

              <details className="shopping-list-item__details">
                <summary>Editar</summary>
                <form action={updateShoppingListItemAction} className="shopping-list-item__edit-form">
                  <input name="id" type="hidden" value={item.id} />
                  <label className="field shopping-list-item__edit-name" htmlFor={`shopping-list-name-${item.id}`}>
                    <span>Nombre</span>
                    <input id={`shopping-list-name-${item.id}`} name="name" type="text" maxLength={120} required defaultValue={item.name} />
                  </label>
                  <label className="field" htmlFor={`shopping-list-quantity-${item.id}`}>
                    <span>Cantidad</span>
                    <input id={`shopping-list-quantity-${item.id}`} name="quantity" type="number" min="0.000001" step="any" required defaultValue={item.quantity} />
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
        <p className="shopping-list-group__empty">No hay productos en esta sección.</p>
      )}
    </section>
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
    <AppShell>
      <div className="shopping-list-page">
        <header className="shopping-list-header">
          <span className="shopping-list-eyebrow">Lista de la compra</span>
          <h1>Compra solo lo que necesitas</h1>
          <p>Organiza lo que tienes pendiente, marca lo que ya has comprado y pásalo directamente al inventario.</p>
        </header>

        <div className="shopping-list-messages">
          {shoppingListErrorMessage ? <p className="shopping-list-message shopping-list-message--error" role="alert">{shoppingListErrorMessage}</p> : null}
          {shoppingListSuccessMessage ? <p className="shopping-list-message shopping-list-message--success" role="status">{shoppingListSuccessMessage}</p> : null}
        </div>

        {!error ? (
          <section className="shopping-list-summary" aria-label="Resumen de la lista">
            <div className="shopping-list-summary__item"><span>Total</span><strong>{items.length}</strong></div>
            <div className="shopping-list-summary__item"><span>Pendientes</span><strong>{pendingItems.length}</strong></div>
            <div className="shopping-list-summary__item"><span>Comprados</span><strong>{purchasedItems.length}</strong></div>
          </section>
        ) : null}

        <section className="shopping-list-add" aria-labelledby="shopping-list-add-heading">
          <div className="shopping-list-add__heading">
            <span className="shopping-list-eyebrow">Nuevo producto</span>
            <h2 id="shopping-list-add-heading">Añade algo a tu lista</h2>
            <p>Añade los productos que necesitas comprar.</p>
          </div>
          <form action={addShoppingListItemAction} className="shopping-list-add__form">
            <label className="field shopping-list-add__name" htmlFor="shopping-list-name">
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

        <VoiceShoppingBatchInput />

        {error ? (
          <section className="shopping-list-load-error" role="alert" aria-labelledby="shopping-list-load-error-heading">
            <span className="shopping-list-eyebrow">Error de carga</span>
            <h2 id="shopping-list-load-error-heading">No se pudo cargar la lista de la compra</h2>
            <p>No se pudo cargar la lista de la compra. Inténtalo de nuevo.</p>
          </section>
        ) : items.length === 0 ? (
          <section className="shopping-list-empty" aria-labelledby="shopping-list-empty-heading">
            <span className="shopping-list-eyebrow">Lista vacía</span>
            <h2 id="shopping-list-empty-heading">Tu lista de la compra está vacía</h2>
            <p>Añade tu primer producto para empezar.</p>
          </section>
        ) : (
          <div className="shopping-list-groups">
            <ShoppingListGroup items={pendingItems} title="Pendientes" />
            <ShoppingListGroup items={purchasedItems} title="Comprados" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
