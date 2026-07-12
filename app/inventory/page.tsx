import Link from "next/link";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

import { addInventoryItemAction, consumeInventoryItemAction, deleteInventoryItemAction, updateInventoryItemAction } from "./actions";

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
  query?: string;
  location?: string;
  expiration?: string;
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

const expirationFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const inventoryLocations = ["pantry", "fridge", "freezer"] as const;
const expirationFilters = ["expired", "today", "soon", "none"] as const;

type ExpirationFilter = (typeof expirationFilters)[number];

function toUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getUtcDateKeyTimestamp(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00.000Z`);
}

function getExpirationDayDifference(expiresAt: string, todayKey: string) {
  const expirationKey = toUtcDateKey(new Date(`${expiresAt}T00:00:00.000Z`));

  return Math.round((getUtcDateKeyTimestamp(expirationKey) - getUtcDateKeyTimestamp(todayKey)) / millisecondsPerDay);
}

function formatExpirationDate(expiresAt: string | null, todayKey: string) {
  if (!expiresAt) return "Sin fecha de caducidad";

  const dayDifference = getExpirationDayDifference(expiresAt, todayKey);

  if (dayDifference < 0) return "Caducado";
  if (dayDifference === 0) return "Caduca hoy";
  if (dayDifference === 1) return "Caduca en 1 día";
  if (dayDifference <= 7) return `Caduca en ${dayDifference} días`;

  return expirationFormatter.format(new Date(`${expiresAt}T00:00:00.000Z`));
}

function getExpirationAlertItems(items: InventoryItemRow[], todayKey: string) {
  return items
    .filter((item) => {
      if (!item.expires_at) return false;

      const dayDifference = getExpirationDayDifference(item.expires_at, todayKey);

      return dayDifference <= 7;
    })
    .sort((firstItem, secondItem) => {
      return getUtcDateKeyTimestamp(firstItem.expires_at ?? "") - getUtcDateKeyTimestamp(secondItem.expires_at ?? "");
    });
}

function isInventoryLocation(value: string | undefined): value is InventoryLocation {
  return inventoryLocations.some((location) => location === value);
}

function isExpirationFilter(value: string | undefined): value is ExpirationFilter {
  return expirationFilters.some((expirationFilter) => expirationFilter === value);
}

function matchesExpirationFilter(item: InventoryItemRow, expirationFilter: ExpirationFilter | null, todayKey: string) {
  if (!expirationFilter) return true;
  if (!item.expires_at) return expirationFilter === "none";

  const dayDifference = getExpirationDayDifference(item.expires_at, todayKey);

  if (expirationFilter === "expired") return dayDifference < 0;
  if (expirationFilter === "today") return dayDifference === 0;
  if (expirationFilter === "soon") return dayDifference >= 1 && dayDifference <= 7;

  return false;
}

function filterInventoryItems(
  items: InventoryItemRow[],
  filters: {
    query: string;
    location: InventoryLocation | null;
    expiration: ExpirationFilter | null;
    todayKey: string;
  },
) {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("es-ES");

  return items.filter((item) => {
    const matchesQuery = normalizedQuery ? item.name.toLocaleLowerCase("es-ES").includes(normalizedQuery) : true;
    const matchesLocation = filters.location ? item.location === filters.location : true;

    return matchesQuery && matchesLocation && matchesExpirationFilter(item, filters.expiration, filters.todayKey);
  });
}

function groupInventoryItems(items: InventoryItemRow[]): InventoryGroup[] {
  return inventoryLocations.map((location) => ({
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
  const todayKey = toUtcDateKey(new Date());
  const expirationAlertItems = getExpirationAlertItems(items, todayKey);
  const resolvedSearchParams = await searchParams;
  const queryFilter = resolvedSearchParams?.query ?? "";
  const locationFilter = isInventoryLocation(resolvedSearchParams?.location) ? resolvedSearchParams.location : null;
  const expirationFilter = isExpirationFilter(resolvedSearchParams?.expiration) ? resolvedSearchParams.expiration : null;
  const filteredItems = filterInventoryItems(items, {
    query: queryFilter,
    location: locationFilter,
    expiration: expirationFilter,
    todayKey,
  });
  const groupedItems = groupInventoryItems(filteredItems);
  const hasActiveFilters = Boolean(queryFilter.trim() || locationFilter || expirationFilter);
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
        <>
          <section className="card form-section">
            <h2>Buscar y filtrar</h2>
            <form action="/inventory" className="meal-log-form">
              <label className="field" htmlFor="inventory-query">
                <span>Buscar por nombre</span>
                <input id="inventory-query" name="query" type="search" defaultValue={queryFilter} placeholder="Pollo" />
              </label>
              <label className="field" htmlFor="inventory-location-filter">
                <span>Ubicación</span>
                <select id="inventory-location-filter" name="location" defaultValue={locationFilter ?? ""}>
                  <option value="">Todas</option>
                  <option value="pantry">Despensa</option>
                  <option value="fridge">Nevera</option>
                  <option value="freezer">Congelador</option>
                </select>
              </label>
              <label className="field" htmlFor="inventory-expiration-filter">
                <span>Caducidad</span>
                <select id="inventory-expiration-filter" name="expiration" defaultValue={expirationFilter ?? ""}>
                  <option value="">Todos</option>
                  <option value="expired">Caducados</option>
                  <option value="today">Caducan hoy</option>
                  <option value="soon">Próximos 7 días</option>
                  <option value="none">Sin fecha de caducidad</option>
                </select>
              </label>
              <button className="button" type="submit">Aplicar filtros</button>
              {hasActiveFilters ? (
                <Link className="logout-link" href="/inventory">
                  Limpiar filtros
                </Link>
              ) : null}
            </form>
          </section>

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
                    <span className="muted">{formatExpirationDate(item.expires_at, todayKey)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {filteredItems.length ? (
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
                          <span className="muted">{formatExpirationDate(item.expires_at, todayKey)}</span>
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
          ) : (
            <section className="card">
              <h2>No hay productos que coincidan con estos filtros.</h2>
              <Link className="logout-link" href="/inventory">
                Limpiar filtros
              </Link>
            </section>
          )}
        </>
      )}
    </main>
  );
}
