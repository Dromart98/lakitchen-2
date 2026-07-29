import Link from "next/link";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import { AppShell } from "@/components/layout/AppShell";

import { InventoryConsumeForm } from "@/components/inventory/InventoryConsumeForm";
import { InventoryNutritionAiControls } from "@/components/inventory/InventoryNutritionAiControls";
import { VoiceInventoryBatchInput } from "@/components/inventory/VoiceInventoryBatchInput";
import { BarcodeCatalogControls } from "./BarcodeCatalogControls";
import { InventoryAddCta } from "./InventoryAddCta";
import { InventoryNutritionCta } from "./InventoryNutritionCta";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import {
  getInventoryCategoryLabel,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
} from "@/modules/inventory/inventory-categories";
import { INVENTORY_ADD_FORM_FIELD_IDS } from "@/modules/inventory/inventory-form-fields";
import { createClient } from "@/lib/supabase/server";
import {
  getInventoryNutritionBasisLabel,
  hasCompleteInventoryNutritionValues,
  INVENTORY_NUTRITION_BASIS_LABELS,
  NUTRITION_BASES,
} from "@/modules/inventory/inventory-nutrition";
import {
  formatInventoryExpirationLabel,
  getCurrentInventoryExpirationDateKey,
  getInventoryExpirationAlertItems,
  getInventoryExpirationDayDifference,
} from "@/modules/inventory/inventory-expiration";
import { groupInventoryItems } from "@/modules/inventory/inventory-groups";
import type {
  InventoryItemRecord,
  InventoryLocation,
} from "@/modules/inventory/inventory.types";
import {
  selectInventoryUnitMeasures,
  toInventoryUnitMeasureValue,
  type InventoryConfirmedUnitMeasure,
} from "@/modules/inventory/inventory-unit-equivalence";

import {
  addInventoryItemAction,
  deleteInventoryItemAction,
  lookupBarcodeProductAction,
  updateInventoryItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

type InventoryExpirationFilter =
  | "all"
  | "expired"
  | "today"
  | "next-7-days"
  | "no-date";

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

const expirationFilters: { value: InventoryExpirationFilter; label: string }[] =
  [
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
  "invalid-nutrition-basis": "Selecciona una base nutricional válida.",
  "missing-nutrition-basis":
    "Selecciona si los valores nutricionales son por 100 g o por unidad.",
  "invalid-calories": "Introduce calorías válidas, sin valores negativos.",
  "invalid-protein": "Introduce proteínas válidas, sin valores negativos.",
  "invalid-carbs": "Introduce carbohidratos válidos, sin valores negativos.",
  "invalid-fat": "Introduce grasas válidas, sin valores negativos.",
  "save-failed": "No se pudo guardar el producto. Inténtalo de nuevo.",
  "update-not-found": "Este producto ya no está disponible.",
  "update-failed": "No se pudo actualizar el producto. Inténtalo de nuevo.",
  "delete-not-found": "Este producto ya no está disponible.",
  "consume-not-found": "Este producto ya no está disponible.",
  "consume-too-much": "La cantidad indicada supera el stock disponible.",
  "consume-failed": "No se pudo actualizar el inventario. Inténtalo de nuevo.",
  "consume-log-not-found": "Este producto ya no está disponible.",
  "consume-log-invalid-quantity":
    "La cantidad debe ser un número mayor que cero.",
  "consume-log-too-much": "La cantidad indicada supera el stock disponible.",
  "consume-log-incomplete-nutrition":
    "Completa las calorías y todos los macros para registrar este consumo como comida.",
  "consume-log-incompatible-unit":
    "No se puede registrar este consumo como comida con la unidad actual.",
  "consume-log-invalid-meal-type": "Selecciona un tipo de comida válido.",
  "consume-log-failed": "No se pudo registrar la comida. Inténtalo de nuevo.",
  "delete-failed": "No se pudo eliminar el producto. Inténtalo de nuevo.",
};

const inventorySuccessMessages: Record<string, string> = {
  "item-created": "Producto añadido al inventario correctamente.",
  "item-created-barcode-memory-failed":
    "Producto añadido al inventario correctamente, pero no se pudo recordar el código.",
  "item-created-barcode-measure-failed":
    "Producto y código guardados, pero no se pudo recordar la medida habitual.",
  "item-updated": "Producto actualizado correctamente.",
  "item-deleted": "Producto eliminado correctamente.",
  "item-consumed": "Cantidad descontada correctamente.",
  "item-consumed-completely":
    "Producto consumido por completo y eliminado del inventario.",
  "item-consumed-logged":
    "Producto consumido y comida registrada correctamente.",
  "item-consumed-logged-completely":
    "Producto consumido y comida registrada correctamente.",
};

function isInventoryLocation(
  value: string | undefined,
): value is InventoryLocation {
  return inventoryLocations.some((location) => location === value);
}

function isExpirationFilter(
  value: string | undefined,
): value is InventoryExpirationFilter {
  return expirationFilters.some((filter) => filter.value === value);
}

function formatOptionalNutritionValue(value: number | null, suffix: string) {
  return value === null ? null : `${value} ${suffix}`;
}

function getInventoryNutritionParts(item: InventoryItemRecord) {
  return [
    formatOptionalNutritionValue(item.calories, "kcal"),
    formatOptionalNutritionValue(item.protein_g, "g proteína"),
    formatOptionalNutritionValue(item.carbs_g, "g carbohidratos"),
    formatOptionalNutritionValue(item.fat_g, "g grasas"),
  ].filter((part): part is string => Boolean(part));
}

function matchesExpirationFilter(
  item: InventoryItemRecord,
  expirationFilter: InventoryExpirationFilter,
  todayKey: string,
) {
  if (expirationFilter === "all") return true;
  if (expirationFilter === "no-date") return !item.expires_at;
  if (!item.expires_at) return false;

  const dayDifference = getInventoryExpirationDayDifference(
    item.expires_at,
    todayKey,
  );

  if (expirationFilter === "expired") return dayDifference < 0;
  if (expirationFilter === "today") return dayDifference === 0;

  return dayDifference > 0 && dayDifference <= 7;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<InventoryPageSearchParams>;
}) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory");

  const { data, error } = (await (supabase as any)
    .from("inventory_items")
    .select(
      "id, food_catalog_item_id, name, location, category, nutrition_basis, calories, protein_g, carbs_g, fat_g, quantity, unit, expires_at, created_at",
    )
    .eq("user_id", user.id)
    .order("location", { ascending: true })
    .order("name", { ascending: true })
    .order("created_at", { ascending: true })) as {
    data: InventoryItemRecord[] | null;
    error: { message: string } | null;
  };

  if (error) {
    console.warn("Supabase could not load inventory items:", error.message);
  }

  const items = error ? [] : (data ?? []);
  const foodCatalogItemIds = [...new Set(items
    .map((item) => item.food_catalog_item_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  let unitMeasures = new Map<string, InventoryConfirmedUnitMeasure>();
  if (foodCatalogItemIds.length > 0) {
    const { data: equivalenceRows, error: equivalenceError } = await (supabase as any)
      .from("food_quantity_equivalences")
      .select("id, user_id, food_catalog_item_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed, updated_at")
      .eq("user_id", user.id)
      .eq("measure_kind", "unit")
      .eq("user_confirmed", true)
      .eq("source", "user")
      .in("food_catalog_item_id", foodCatalogItemIds);
    if (equivalenceError) {
      console.warn("Supabase could not load habitual food measures:", equivalenceError.message);
    } else {
      unitMeasures = new Map(selectInventoryUnitMeasures(equivalenceRows ?? [], user.id, foodCatalogItemIds));
    }
  }
  const todayKey = getCurrentInventoryExpirationDateKey(new Date());
  const expirationAlertItems = getInventoryExpirationAlertItems(
    items,
    todayKey,
  );
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.query?.trim() ?? "";
  const selectedLocation: InventoryLocation | "all" = isInventoryLocation(
    resolvedSearchParams?.location,
  )
    ? resolvedSearchParams.location
    : "all";
  const selectedExpiration: InventoryExpirationFilter = isExpirationFilter(
    resolvedSearchParams?.expiration,
  )
    ? resolvedSearchParams.expiration
    : "all";
  const normalizedQuery = query.toLocaleLowerCase("es-ES");
  const filteredItems = items.filter((item) => {
    const matchesQuery = normalizedQuery
      ? item.name.toLocaleLowerCase("es-ES").includes(normalizedQuery)
      : true;
    const matchesLocation =
      selectedLocation === "all" ? true : item.location === selectedLocation;

    return (
      matchesQuery &&
      matchesLocation &&
      matchesExpirationFilter(item, selectedExpiration, todayKey)
    );
  });
  const locationCounts = inventoryLocations.reduce<
    Record<InventoryLocation, number>
  >(
    (counts, location) => {
      counts[location] = items.filter(
        (item) => item.location === location,
      ).length;
      return counts;
    },
    { pantry: 0, fridge: 0, freezer: 0 },
  );
  const hasActiveFilters = Boolean(
    query || selectedLocation !== "all" || selectedExpiration !== "all",
  );
  const groupedItems = groupInventoryItems(filteredItems, hasActiveFilters);
  const inventoryErrorMessage = resolvedSearchParams?.inventoryError
    ? inventoryErrorMessages[resolvedSearchParams.inventoryError]
    : null;
  const inventorySuccessMessage = resolvedSearchParams?.inventorySuccess
    ? inventorySuccessMessages[resolvedSearchParams.inventorySuccess]
    : null;

  return (
    <AppShell>
      <div className="inventory-page">
        <header className="inventory-header">
          <div className="inventory-header__copy">
            <span className="inventory-eyebrow">Inventario</span>
            <h1>Todo lo que tienes en casa</h1>
            <p>
              Controla tus productos, localiza lo que necesitas y evita que nada
              se quede atrás.
            </p>
          </div>
          <div className="inventory-header__actions">
            <Link className="inventory-shopping-link" href="/inventory/equivalences">
              Medidas habituales
            </Link>
            <Link className="inventory-shopping-link" href="/shopping-list">
              Lista de la compra
            </Link>
            <InventoryAddCta fieldId={INVENTORY_ADD_FORM_FIELD_IDS.name} />
          </div>
        </header>

        {inventoryErrorMessage ? (
          <p className="auth-message error" role="alert">
            {inventoryErrorMessage}
          </p>
        ) : null}
        {inventorySuccessMessage ? (
          <p className="auth-message success" role="status">
            {inventorySuccessMessage}
          </p>
        ) : null}

        <section
          className="inventory-summary"
          aria-label="Resumen del inventario"
        >
          <article className="inventory-summary__item inventory-summary__item--total">
            <span>Total de productos</span>
            <strong>{items.length}</strong>
          </article>
          {inventoryLocations.map((location) => (
            <article className="inventory-summary__item" key={location}>
              <span>{locationLabels[location]}</span>
              <strong>{locationCounts[location]}</strong>
            </article>
          ))}
          <article className="inventory-summary__item inventory-summary__item--attention">
            <span>Necesitan atención</span>
            <strong>{expirationAlertItems.length}</strong>
          </article>
        </section>

        {expirationAlertItems.length ? (
          <section
            className="inventory-section inventory-attention"
            aria-labelledby="inventory-attention-title"
          >
            <div className="inventory-section__heading">
              <div>
                <span className="inventory-section__kicker">Caducidad</span>
                <h2 id="inventory-attention-title">Revisa estos productos</h2>
              </div>
              <span className="inventory-count">
                {expirationAlertItems.length}
              </span>
            </div>
            <ul className="inventory-attention__list">
              {expirationAlertItems.map((item) => {
                const dayDifference = getInventoryExpirationDayDifference(
                  item.expires_at ?? "",
                  todayKey,
                );
                const expirationStatus =
                  dayDifference < 0
                    ? "Caducado"
                    : dayDifference === 0
                      ? "Caduca hoy"
                      : "Próximos siete días";
                return (
                  <li className="inventory-attention__item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.quantity} {item.unit} ·{" "}
                        {locationLabels[item.location]}
                      </span>
                    </div>
                    <span className="inventory-expiration-status">
                      {expirationStatus} ·{" "}
                      {formatInventoryExpirationLabel(
                        item.expires_at,
                        todayKey,
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section
          className="inventory-products"
          aria-labelledby="inventory-products-title"
        >
          <div className="inventory-section__heading">
            <div>
              <span className="inventory-section__kicker">Por ubicación</span>
              <h2 id="inventory-products-title">Tus productos</h2>
            </div>
            <span className="inventory-count">
              {filteredItems.length} visibles
            </span>
          </div>
          <details
            className="inventory-filters"
            open={hasActiveFilters}
          >
            <summary>
              <span>
                <strong>Encuentra rápido</strong>
                <small>Busca y filtra tus productos</small>
              </span>
              {hasActiveFilters ? (
                <span className="inventory-filter-status">Filtros activos</span>
              ) : null}
            </summary>
            <form
              action="/inventory"
              method="get"
              className="inventory-filter-form"
            >
              <label
                className="field inventory-filter-form__search"
                htmlFor="inventory-query"
              >
                <span>Buscar por nombre</span>
                <input
                  id="inventory-query"
                  name="query"
                  type="search"
                  placeholder="Arroz"
                  defaultValue={query}
                />
              </label>
              <label className="field" htmlFor="inventory-location-filter">
                <span>Ubicación</span>
                <select
                  id="inventory-location-filter"
                  name="location"
                  defaultValue={selectedLocation}
                >
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
                <select
                  id="inventory-expiration-filter"
                  name="expiration"
                  defaultValue={selectedExpiration}
                >
                  {expirationFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inventory-filter-form__actions">
                <button className="inventory-button" type="submit">
                  Aplicar filtros
                </button>
                <Link className="inventory-text-link" href="/inventory">
                  Limpiar filtros
                </Link>
              </div>
            </form>
          </details>

          {error ? (
            <div className="inventory-empty" role="alert">
              <h3>No se pudo cargar el inventario</h3>
              <p>No se pudo cargar el inventario. Inténtalo de nuevo.</p>
            </div>
          ) : null}
          {!error && items.length === 0 ? (
            <div className="inventory-empty">
              <h3>Tu inventario está vacío</h3>
              <p>Abre el formulario y añade tu primer producto.</p>
            </div>
          ) : null}
          {!error && items.length > 0 ? (
            <>
              {filteredItems.length === 0 ? (
              <p className="inventory-empty">
                No hay productos que coincidan con estos filtros.
              </p>
            ) : null}
              <div className="inventory-groups">
              {groupedItems.map((group) => (
                <section
                  className="inventory-group"
                  key={group.location}
                  aria-labelledby={`inventory-group-${group.location}`}
                >
                  <div className="inventory-group__heading">
                    <h3 id={`inventory-group-${group.location}`}>
                      {group.label}
                    </h3>
                    <span>{group.items.length} productos visibles</span>
                  </div>
                  {group.items.length ? (
                    <ul className="inventory-product-list">
                      {group.items.map((item) => {
                        const nutritionParts = getInventoryNutritionParts(item);
                        const hasCompleteNutrition = Boolean(item.nutrition_basis)
                          && hasCompleteInventoryNutritionValues(item);
                        const hasValidItemId = typeof item.id === "string" && item.id.trim().length > 0;
                        const confirmedMeasureSnapshot = item.food_catalog_item_id
                          ? unitMeasures.get(item.food_catalog_item_id) ?? null
                          : null;
                        const confirmedMeasure = confirmedMeasureSnapshot
                          ? toInventoryUnitMeasureValue(confirmedMeasureSnapshot)
                          : null;
                        return (
                          <li className="inventory-product" key={item.id}>
                            <div className="inventory-product__main">
                              <div className="inventory-product__identity">
                                <strong>{item.name}</strong>
                                <span className="inventory-product__quantity">
                                  {item.quantity} {item.unit}
                                </span>
                              </div>
                              <span className="inventory-category">
                                {getInventoryCategoryLabel(item.category)}
                              </span>
                              {item.expires_at ? (
                                <p className="inventory-product__expiration">
                                  {formatInventoryExpirationLabel(
                                    item.expires_at,
                                    todayKey,
                                  )}
                                </p>
                              ) : null}
                            </div>
                            {!hasCompleteNutrition && hasValidItemId ? (
                              <InventoryNutritionCta
                                editId={`inventory-edit-${item.id}`}
                                manageId={`inventory-manage-${item.id}`}
                                nutritionControlId={`inventory-nutrition-ai-${item.id}`}
                                nutritionButtonId={`inventory-nutrition-ai-button-${item.id}`}
                              />
                            ) : null}
                            <details className="inventory-manage" id={`inventory-manage-${item.id}`}>
                              <summary>Gestionar</summary>
                              <div className="inventory-manage__panel">
                              <div className="inventory-nutrition">
                                <strong>Información nutricional</strong>
                              {nutritionParts.length ? (
                                <div>
                                  <strong>
                                    {getInventoryNutritionBasisLabel(
                                      item.nutrition_basis,
                                    )}
                                  </strong>
                                  <p>{nutritionParts.join(" · ")}</p>
                                </div>
                              ) : (
                                <p>Nutrición pendiente</p>
                              )}
                              </div>
                            <div className="inventory-product__actions">
                              <details className="inventory-action">
                                <summary>Descontar cantidad</summary>
                                <div className="inventory-action__panel">
                                  <InventoryConsumeForm
                                    id={item.id}
                                    quantity={item.quantity}
                                    unit={item.unit}
                                    nutrition_basis={item.nutrition_basis}
                                    calories={item.calories}
                                    protein_g={item.protein_g}
                                    carbs_g={item.carbs_g}
                                    fat_g={item.fat_g}
                                    confirmedUnitMeasure={confirmedMeasure}
                                  />
                                </div>
                              </details>
                              <details className="inventory-action" id={`inventory-edit-${item.id}`}>
                                <summary>Editar</summary>
                                <div className="inventory-action__panel">
                                  {" "}
                                  <form
                                    action={updateInventoryItemAction}
                                    className="meal-log-form"
                                  >
                                    <input
                                      name="id"
                                      type="hidden"
                                      value={item.id}
                                    />
                                    <input id={`inventory-food-catalog-item-id-${item.id}`} name="food_catalog_item_id" type="hidden" defaultValue={item.food_catalog_item_id ?? ""} />
                                    <input id={`inventory-catalog-resolved-name-${item.id}`} name="catalog_resolved_name" type="hidden" defaultValue={item.name} />
                                    <label
                                      className="field"
                                      htmlFor={`inventory-name-${item.id}`}
                                    >
                                      <span>Nombre</span>
                                      <input
                                        id={`inventory-name-${item.id}`}
                                        name="name"
                                        type="text"
                                        maxLength={120}
                                        required
                                        defaultValue={item.name}
                                      />
                                    </label>
                                    <label
                                      className="field"
                                      htmlFor={`inventory-location-${item.id}`}
                                    >
                                      <span>Ubicación</span>
                                      <select
                                        id={`inventory-location-${item.id}`}
                                        name="location"
                                        required
                                        defaultValue={item.location}
                                      >
                                        <option value="pantry">Despensa</option>
                                        <option value="fridge">Nevera</option>
                                        <option value="freezer">
                                          Congelador
                                        </option>
                                      </select>
                                    </label>
                                    <label
                                      className="field"
                                      htmlFor={`inventory-category-${item.id}`}
                                    >
                                      <span>Categoría nutricional</span>
                                      <select
                                        id={`inventory-category-${item.id}`}
                                        name="category"
                                        defaultValue={item.category ?? ""}
                                      >
                                        <option value="">Sin categoría</option>
                                        {INVENTORY_CATEGORIES.map(
                                          (category) => (
                                            <option
                                              key={category}
                                              value={category}
                                            >
                                              {
                                                INVENTORY_CATEGORY_LABELS[
                                                  category
                                                ]
                                              }
                                            </option>
                                          ),
                                        )}
                                      </select>
                                    </label>
                                    <label
                                      className="field"
                                      htmlFor={`inventory-quantity-${item.id}`}
                                    >
                                      <span>Cantidad</span>
                                      <input
                                        id={`inventory-quantity-${item.id}`}
                                        name="quantity"
                                        type="number"
                                        min="0.000001"
                                        step="any"
                                        required
                                        defaultValue={item.quantity}
                                      />
                                    </label>
                                    <label
                                      className="field"
                                      htmlFor={`inventory-unit-${item.id}`}
                                    >
                                      <span>Unidad</span>
                                      <select
                                        id={`inventory-unit-${item.id}`}
                                        name="unit"
                                        required
                                        defaultValue={item.unit}
                                      >
                                        <option value="ud">ud</option>
                                        <option value="g">g</option>
                                        <option value="kg">kg</option>
                                        <option value="ml">ml</option>
                                        <option value="l">l</option>
                                      </select>
                                    </label>
                                    <label
                                      className="field"
                                      htmlFor={`inventory-expires-at-${item.id}`}
                                    >
                                      <span>Caducidad (opcional)</span>
                                      <input
                                        id={`inventory-expires-at-${item.id}`}
                                        name="expires_at"
                                        type="date"
                                        defaultValue={item.expires_at ?? ""}
                                      />
                                    </label>
                                    <fieldset className="meal-log-form">
                                      <legend>
                                        Información nutricional opcional
                                      </legend>
                                      <label
                                        className="field"
                                        htmlFor={`inventory-nutrition-basis-${item.id}`}
                                      >
                                        <span>Valores por</span>
                                        <select
                                          id={`inventory-nutrition-basis-${item.id}`}
                                          name="nutrition_basis"
                                          defaultValue={
                                            item.nutrition_basis ?? ""
                                          }
                                        >
                                          <option value="">
                                            Sin información nutricional
                                          </option>
                                          {NUTRITION_BASES.map((basis) => (
                                            <option key={basis} value={basis}>
                                              {
                                                INVENTORY_NUTRITION_BASIS_LABELS[
                                                  basis
                                                ]
                                              }
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label
                                        className="field"
                                        htmlFor={`inventory-calories-${item.id}`}
                                      >
                                        <span>Calorías</span>
                                        <input
                                          id={`inventory-calories-${item.id}`}
                                          name="calories"
                                          type="number"
                                          min="0"
                                          step="any"
                                          inputMode="decimal"
                                          defaultValue={item.calories ?? ""}
                                        />
                                      </label>
                                      <label
                                        className="field"
                                        htmlFor={`inventory-protein-g-${item.id}`}
                                      >
                                        <span>Proteínas (g)</span>
                                        <input
                                          id={`inventory-protein-g-${item.id}`}
                                          name="protein_g"
                                          type="number"
                                          min="0"
                                          step="any"
                                          inputMode="decimal"
                                          defaultValue={item.protein_g ?? ""}
                                        />
                                      </label>
                                      <label
                                        className="field"
                                        htmlFor={`inventory-carbs-g-${item.id}`}
                                      >
                                        <span>Carbohidratos (g)</span>
                                        <input
                                          id={`inventory-carbs-g-${item.id}`}
                                          name="carbs_g"
                                          type="number"
                                          min="0"
                                          step="any"
                                          inputMode="decimal"
                                          defaultValue={item.carbs_g ?? ""}
                                        />
                                      </label>
                                      <label
                                        className="field"
                                        htmlFor={`inventory-fat-g-${item.id}`}
                                      >
                                        <span>Grasas (g)</span>
                                        <input
                                          id={`inventory-fat-g-${item.id}`}
                                          name="fat_g"
                                          type="number"
                                          min="0"
                                          step="any"
                                          inputMode="decimal"
                                          defaultValue={item.fat_g ?? ""}
                                        />
                                      </label>
                                    </fieldset>
                                    <InventoryNutritionAiControls
                                      controlId={`inventory-nutrition-ai-${item.id}`}
                                      buttonId={`inventory-nutrition-ai-button-${item.id}`}
                                      fieldIds={{
                                        name: `inventory-name-${item.id}`,
                                        quantity: `inventory-quantity-${item.id}`,
                                        unit: `inventory-unit-${item.id}`,
                                        category: `inventory-category-${item.id}`,
                                        nutritionBasis: `inventory-nutrition-basis-${item.id}`,
                                        calories: `inventory-calories-${item.id}`,
                                        proteinG: `inventory-protein-g-${item.id}`,
                                        carbsG: `inventory-carbs-g-${item.id}`,
                                        fatG: `inventory-fat-g-${item.id}`,
                                        foodCatalogItemId: `inventory-food-catalog-item-id-${item.id}`,
                                        catalogResolvedName: `inventory-catalog-resolved-name-${item.id}`,
                                      }}
                                    />
                                    <button className="button" type="submit">
                                      Guardar cambios
                                    </button>
                                  </form>
                                </div>
                              </details>
                              <form
                                action={deleteInventoryItemAction}
                                className="inventory-delete-form"
                              >
                                <input
                                  name="id"
                                  type="hidden"
                                  value={item.id}
                                />
                                <button
                                  className="inventory-delete-button"
                                  type="submit"
                                >
                                  Eliminar
                                </button>
                              </form>
                            </div>
                              </div>
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="inventory-group__empty">
                      No hay productos en esta ubicación.
                    </p>
                  )}
                </section>
              ))}
              </div>
            </>
          ) : null}
        </section>

        <details
          className="inventory-add"
          id="anadir-producto"
          open={items.length === 0}
        >
          <summary>
            <span>
              <strong>Nuevo producto</strong>
              <small>Registra un producto en unos pasos</small>
            </span>
          </summary>
          <div className="inventory-add__body">
            <div className="inventory-add__intro">
              <p>
                Completa los datos o utiliza el código de barras para empezar.
              </p>
              <Link className="inventory-text-link" href="/inventory/barcodes">
                Gestionar productos recordados
              </Link>
            </div>
            <details className="inventory-action">
              <summary>Añadir por voz</summary>
              <VoiceInventoryBatchInput />
            </details>
            <form action={addInventoryItemAction} className="meal-log-form">
              <input id={INVENTORY_ADD_FORM_FIELD_IDS.foodCatalogItemId} name="food_catalog_item_id" type="hidden" />
              <input id={INVENTORY_ADD_FORM_FIELD_IDS.catalogResolvedName} name="catalog_resolved_name" type="hidden" />
              <label
                className="field"
                htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.name}
              >
                <span>Nombre</span>
                <input
                  id={INVENTORY_ADD_FORM_FIELD_IDS.name}
                  name="name"
                  type="text"
                  maxLength={120}
                  required
                  placeholder="Arroz integral"
                />
              </label>
              <label
                className="field"
                htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.location}
              >
                <span>Ubicación</span>
                <select
                  id={INVENTORY_ADD_FORM_FIELD_IDS.location}
                  name="location"
                  required
                  defaultValue="pantry"
                >
                  <option value="pantry">Despensa</option>
                  <option value="fridge">Nevera</option>
                  <option value="freezer">Congelador</option>
                </select>
              </label>
              <label
                className="field"
                htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.category}
              >
                <span>Categoría nutricional</span>
                <select
                  id={INVENTORY_ADD_FORM_FIELD_IDS.category}
                  name="category"
                  defaultValue=""
                >
                  <option value="">Sin categoría</option>
                  {INVENTORY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {INVENTORY_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="field"
                htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.quantity}
              >
                <span>Cantidad</span>
                <input
                  id={INVENTORY_ADD_FORM_FIELD_IDS.quantity}
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  placeholder="1"
                />
              </label>
              <label
                className="field"
                htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.unit}
              >
                <span>Unidad</span>
                <select
                  id={INVENTORY_ADD_FORM_FIELD_IDS.unit}
                  name="unit"
                  required
                  defaultValue="ud"
                >
                  <option value="ud">ud</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">l</option>
                </select>
              </label>
              <label
                className="field"
                htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.expiresAt}
              >
                <span>Caducidad (opcional)</span>
                <input
                  id={INVENTORY_ADD_FORM_FIELD_IDS.expiresAt}
                  name="expires_at"
                  type="date"
                />
              </label>
              <fieldset className="meal-log-form">
                <legend>Información nutricional opcional</legend>
                <label
                  className="field"
                  htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis}
                >
                  <span>Valores por</span>
                  <select
                    id={INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis}
                    name="nutrition_basis"
                    defaultValue=""
                  >
                    <option value="">Sin información nutricional</option>
                    {NUTRITION_BASES.map((basis) => (
                      <option key={basis} value={basis}>
                        {INVENTORY_NUTRITION_BASIS_LABELS[basis]}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="field"
                  htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.calories}
                >
                  <span>Calorías</span>
                  <input
                    id={INVENTORY_ADD_FORM_FIELD_IDS.calories}
                    name="calories"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="245"
                  />
                </label>
                <label
                  className="field"
                  htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.proteinG}
                >
                  <span>Proteínas (g)</span>
                  <input
                    id={INVENTORY_ADD_FORM_FIELD_IDS.proteinG}
                    name="protein_g"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="22"
                  />
                </label>
                <label
                  className="field"
                  htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.carbsG}
                >
                  <span>Carbohidratos (g)</span>
                  <input
                    id={INVENTORY_ADD_FORM_FIELD_IDS.carbsG}
                    name="carbs_g"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="4"
                  />
                </label>
                <label
                  className="field"
                  htmlFor={INVENTORY_ADD_FORM_FIELD_IDS.fatG}
                >
                  <span>Grasas (g)</span>
                  <input
                    id={INVENTORY_ADD_FORM_FIELD_IDS.fatG}
                    name="fat_g"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="15"
                  />
                </label>
              </fieldset>
              <InventoryNutritionAiControls
                fieldIds={{
                  name: INVENTORY_ADD_FORM_FIELD_IDS.name,
                  quantity: INVENTORY_ADD_FORM_FIELD_IDS.quantity,
                  unit: INVENTORY_ADD_FORM_FIELD_IDS.unit,
                  category: INVENTORY_ADD_FORM_FIELD_IDS.category,
                  nutritionBasis: INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis,
                  calories: INVENTORY_ADD_FORM_FIELD_IDS.calories,
                  proteinG: INVENTORY_ADD_FORM_FIELD_IDS.proteinG,
                  carbsG: INVENTORY_ADD_FORM_FIELD_IDS.carbsG,
                  fatG: INVENTORY_ADD_FORM_FIELD_IDS.fatG,
                  foodCatalogItemId: INVENTORY_ADD_FORM_FIELD_IDS.foodCatalogItemId,
                  catalogResolvedName: INVENTORY_ADD_FORM_FIELD_IDS.catalogResolvedName,
                }}
              />
              <PendingSubmitButton
                className="button"
                idleLabel="Guardar producto"
                pendingLabel="Guardando…"
              />
              <details className="inventory-action inventory-barcode">
                <summary>
                  <span>
                    <strong>Usar código de barras</strong>
                    <small>Busca o escanea un producto</small>
                  </span>
                </summary>
                <BarcodeCatalogControls
                  lookupAction={lookupBarcodeProductAction}
                />
              </details>
            </form>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
