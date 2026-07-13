import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import {
  getInventoryCategoryLabel,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
} from "@/modules/inventory/inventory-categories";
import { createClient } from "@/lib/supabase/server";
import {
  formatInventoryExpirationLabel,
  getCurrentInventoryExpirationDateKey,
  getInventoryExpirationAlertItems,
  getInventoryExpirationDayDifference,
} from "@/modules/inventory/inventory-expiration";
import type { InventoryItemRecord, InventoryLocation } from "@/modules/inventory/inventory.types";

import { addInventoryItemAction, consumeInventoryItemAction, deleteInventoryItemAction, updateInventoryItemAction } from "./actions";

export const dynamic = "force-dynamic";

type InventoryGroup = {
  location: InventoryLocation;
  label: string;
  items: InventoryItemRecord[];
};

type InventoryExpirationFilter = "all" | "expired" | "today" | "next-7-days" | "no-date";

type InventoryPageSearchParams = {
  inventoryError?: string;
  inventorySuccess?: string;
  query?: string;
  location?: string;
  expiration?: string;
};

const locationLabels: Record<InventoryLocation, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
};

const inventoryLocations = ["pantry", "fridge", "freezer"] as const;

const expirationFilters: { value: InventoryExpirationFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "expired", label: "Caducados" },
  { value: "today", label: "Caducan hoy" },
  { value: "next-7-days", label: "Próximos 7 días" },
  { value: "no-date", label: "Sin fecha de caducidad" },
];

const inventoryErrorMessages: Record<string, string> = {
  "name-required": "El nombre del producto es obligatorio.",
  "name-too-long": "El nombre no puede superar los 120 caracteres.",
  "invalid-location": "Selecciona una ubicación válida.",
  "invalid-category": "Selecciona una categoría nutricional válida.",
  "invalid-quantity": "La cantidad debe ser un número mayor que cero.",
  "invalid-unit": "Selecciona una unidad válida.",
  "invalid-expires-at": "Introduce una fecha de caducidad válida.",
  "save-failed": "No se pudo guardar el producto. Inténtalo de nuevo.",
  "update-not-found": "Este producto ya no está disponible.",
  "update-failed": "No se pudo actualizar el producto. Inténtalo de nuevo.",
  "delete-not-found": "Este producto ya no está disponible.",
  "consume-not-found": "Este producto ya no está disponible.",
  "consume-too-much": "La cantidad indicada supera el stock disponible.",
  "consume-failed": "No se pudo actualizar el inventario. Inténtalo de nuevo.",
  "delete-failed": "No se pudo eliminar el producto. Inténtalo de nuevo.",
};

const inventorySuccessMessages: Record<string, string> = {
  "item-created": "Producto añadido al inventario correctamente.",
  "item-updated": "Producto actualizado correctamente.",
  "item-deleted": "Producto eliminado correctamente.",
  "item-consumed": "Cantidad descontada correctamente.",
  "item-consumed-completely": "Producto consumido por completo y eliminado del inventario.",
};

function groupInventoryItems(items: InventoryItemRecord[]): InventoryGroup[] {
  return inventoryLocations.map((location) => ({
    location,
    label: locationLabels[location],
    items: items.filter((item) => item.location === location),
  }));
}

function isInventoryLocation(value: string | undefined): value is InventoryLocation {
  return inventoryLocations.some((location) => location === value);
}

function isExpirationFilter(value: string | undefined): value is InventoryExpirationFilter {
  return expirationFilters.some((filter) => filter.value === value);
}

function matchesExpirationFilter(item: InventoryItemRecord, expirationFilter: InventoryExpirationFilter, todayKey: string) {
  if (expirationFilter === "all") return true;
  if (expirationFilter === "no-date") return !item.expires_at;
  if (!item.expires_at) return false;

  const dayDifference = getInventoryExpirationDayDifference(item.expires_at, todayKey);

  if (expirationFilter === "expired") return dayDifference < 0;
  if (expirationFilter === "today") return dayDifference === 0;

  return dayDifference > 0 && dayDifference <= 7;
}

export default async function InventoryPage({ searchParams }: { searchParams?: Promise<InventoryPageSearchParams> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, location, category, quantity, unit, expires_at, created_at")
    .eq("user_id", user.id)
    .order("location", { ascending: true })
    .order("name", { ascending: true })
    .order("created_at", { ascending: true }) as {
      data: InventoryItemRecord[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not load inventory items:", error.message);
  }

  const items = error ? [] : data ?? [];
  const todayKey = getCurrentInventoryExpirationDateKey(new Date());
  const expirationAlertItems = getInventoryExpirationAlertItems(items, todayKey);
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.query?.trim() ?? "";
  const selectedLocation: InventoryLocation | "all" = isInventoryLocation(resolvedSearchParams?.location) ? resolvedSearchParams.location : "all";
  const selectedExpiration: InventoryExpirationFilter = isExpirationFilter(resolvedSearchParams?.expiration) ? resolvedSearchParams.expiration : "all";
  const normalizedQuery = query.toLocaleLowerCase("es-ES");
  const filteredItems = items.filter((item) => {
    const matchesQuery = normalizedQuery ? item.name.toLocaleLowerCase("es-ES").includes(normalizedQuery) : true;
    const matchesLocation = selectedLocation === "all" ? true : item.location === selectedLocation;

    return matchesQuery && matchesLocation && matchesExpirationFilter(item, selectedExpiration, todayKey);
  });
  const groupedItems = groupInventoryItems(filteredItems);
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
          <label className="field" htmlFor="inventory-category">
            <span>Categoría nutricional</span>
            <select id="inventory-category" name="category" required defaultValue="">
              <option value="" disabled>Selecciona una categoría</option>
              {INVENTORY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {INVENTORY_CATEGORY_LABELS[category]}
                </option>
              ))}
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

      <section className="card form-section">
        <h2>Buscar y filtrar</h2>
        <form action="/inventory" method="get" className="meal-log-form">
          <label className="field" htmlFor="inventory-query">
            <span>Buscar por nombre</span>
            <input id="inventory-query" name="query" type="search" placeholder="Arroz" defaultValue={query} />
          </label>
          <label className="field" htmlFor="inventory-location-filter">
            <span>Ubicación</span>
            <select id="inventory-location-filter" name="location" defaultValue={selectedLocation}>
              <option value="all">Todas</option>
              {inventoryLocations.map((location) => (
                <option key={location} value={location}>
                  {locationLabels[location]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="inventory-expiration-filter">
            <span>Caducidad</span>
            <select id="inventory-expiration-filter" name="expiration" defaultValue={selectedExpiration}>
              {expirationFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">Aplicar filtros</button>
          <Link className="logout-link" href="/inventory">
            Limpiar filtros
          </Link>
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
        <>
          {expirationAlertItems.length ? (
            <section className="card">
              <h2>Revisa estos productos</h2>
              <ul>
                {expirationAlertItems.map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    <br />
                    {item.quantity} {item.unit}
                    <br />
                    <span className="muted">{locationLabels[item.location]}</span>
                    <br />
                    <span className="muted">{formatInventoryExpirationLabel(item.expires_at, todayKey)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {filteredItems.length === 0 ? (
            <section className="card">
              <p className="muted">No hay productos que coincidan con estos filtros.</p>
            </section>
          ) : null}

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
                        <span className="muted">Categoría: {getInventoryCategoryLabel(item.category)}</span>
                        <br />
                        <span className="muted">{formatInventoryExpirationLabel(item.expires_at, todayKey)}</span>
                        <form action={deleteInventoryItemAction} className="meal-log-form">
                          <input name="id" type="hidden" value={item.id} />
                          <button className="button" type="submit">Eliminar</button>
                        </form>
                        <details>
                          <summary>Descontar cantidad</summary>
                          <form action={consumeInventoryItemAction} className="meal-log-form">
                            <input name="id" type="hidden" value={item.id} />
                            <label className="field" htmlFor={`inventory-consumed-quantity-${item.id}`}>
                              <span>Cantidad consumida</span>
                              <input id={`inventory-consumed-quantity-${item.id}`} name="consumed_quantity" type="number" min="0.000001" step="any" required />
                            </label>
                            <button className="button" type="submit">Confirmar consumo</button>
                          </form>
                        </details>
                        <details>
                          <summary>Editar</summary>
                          <form action={updateInventoryItemAction} className="meal-log-form">
                            <input name="id" type="hidden" value={item.id} />
                            <label className="field" htmlFor={`inventory-name-${item.id}`}>
                              <span>Nombre</span>
                              <input id={`inventory-name-${item.id}`} name="name" type="text" maxLength={120} required defaultValue={item.name} />
                            </label>
                            <label className="field" htmlFor={`inventory-location-${item.id}`}>
                              <span>Ubicación</span>
                              <select id={`inventory-location-${item.id}`} name="location" required defaultValue={item.location}>
                                <option value="pantry">Despensa</option>
                                <option value="fridge">Nevera</option>
                                <option value="freezer">Congelador</option>
                              </select>
                            </label>
                            <label className="field" htmlFor={`inventory-category-${item.id}`}>
                              <span>Categoría nutricional</span>
                              <select id={`inventory-category-${item.id}`} name="category" required defaultValue={item.category ?? ""}>
                                <option value="" disabled>Selecciona una categoría</option>
                                {INVENTORY_CATEGORIES.map((category) => (
                                  <option key={category} value={category}>
                                    {INVENTORY_CATEGORY_LABELS[category]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field" htmlFor={`inventory-quantity-${item.id}`}>
                              <span>Cantidad</span>
                              <input id={`inventory-quantity-${item.id}`} name="quantity" type="number" min="0.000001" step="any" required defaultValue={item.quantity} />
                            </label>
                            <label className="field" htmlFor={`inventory-unit-${item.id}`}>
                              <span>Unidad</span>
                              <select id={`inventory-unit-${item.id}`} name="unit" required defaultValue={item.unit}>
                                <option value="ud">ud</option>
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                                <option value="ml">ml</option>
                                <option value="l">l</option>
                              </select>
                            </label>
                            <label className="field" htmlFor={`inventory-expires-at-${item.id}`}>
                              <span>Caducidad (opcional)</span>
                              <input id={`inventory-expires-at-${item.id}`} name="expires_at" type="date" defaultValue={item.expires_at ?? ""} />
                            </label>
                            <button className="button" type="submit">Guardar cambios</button>
                          </form>
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No hay productos en esta ubicación.</p>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
