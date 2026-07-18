import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS, type InventoryCategory } from "@/modules/inventory/inventory-categories";
import { INVENTORY_NUTRITION_BASIS_LABELS, NUTRITION_BASES, type InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";
import { deleteRememberedBarcodeProductAction, updateRememberedBarcodeProductAction } from "./actions";

export const dynamic = "force-dynamic";

type RememberedBarcodeProduct = {
  id: string;
  barcode: string;
  name: string;
  default_quantity: number;
  default_unit: "ud" | "g" | "kg" | "ml" | "l";
  default_location: "pantry" | "fridge" | "freezer" | null;
  default_category: InventoryCategory;
  nutrition_basis: InventoryNutritionBasis | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
  updated_at: string;
};

type BarcodeCatalogSearchParams = {
  barcodeCatalogError?: string;
  barcodeCatalogSuccess?: string;
};

type SupabaseCatalogQueryResult = {
  data: RememberedBarcodeProduct[] | null;
  error: { message: string } | null;
};

type SupabaseBarcodeCatalogClient = {
  from(table: "user_barcode_products"): {
    select(columns: "id, barcode, name, default_quantity, default_unit, default_location, default_category, nutrition_basis, calories, protein_g, carbs_g, fat_g, created_at, updated_at"): {
      eq(column: "user_id", value: string): {
        order(column: "name", options: { ascending: true }): {
          order(column: "barcode", options: { ascending: true }): Promise<SupabaseCatalogQueryResult>;
        };
      };
    };
  };
};

const locationLabels: Record<NonNullable<RememberedBarcodeProduct["default_location"]>, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
};

const errorMessages: Record<string, string> = {
  validation: "Revisa los datos introducidos.",
  "update-failed": "No se pudo actualizar el producto recordado.",
  "delete-failed": "No se pudo eliminar el producto recordado.",
  "not-found": "El producto recordado no existe o no te pertenece.",
};

const successMessages: Record<string, string> = {
  updated: "Producto recordado actualizado correctamente.",
  deleted: "Producto recordado eliminado correctamente.",
};

export default async function RememberedBarcodeProductsPage({
  searchParams,
}: {
  searchParams?: Promise<BarcodeCatalogSearchParams>;
}) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "remembered barcode products");
  const resolvedSearchParams = await searchParams;

  const { data, error } = await (supabase as unknown as SupabaseBarcodeCatalogClient)
    .from("user_barcode_products")
    .select("id, barcode, name, default_quantity, default_unit, default_location, default_category, nutrition_basis, calories, protein_g, carbs_g, fat_g, created_at, updated_at")
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .order("barcode", { ascending: true });

  if (error) {
    console.warn("Supabase could not load remembered barcode products:", error.message);
  }

  const products = error ? [] : data ?? [];
  const errorMessage = resolvedSearchParams?.barcodeCatalogError
    ? errorMessages[resolvedSearchParams.barcodeCatalogError]
    : null;
  const successMessage = resolvedSearchParams?.barcodeCatalogSuccess
    ? successMessages[resolvedSearchParams.barcodeCatalogSuccess]
    : null;

  return (
    <AppShell>
      <div className="barcode-catalog-page">
        <header className="barcode-catalog-header">
          <div>
            <span className="barcode-catalog-eyebrow">Códigos de barras</span>
            <h1 id="barcode-catalog-title">Tus productos recordados</h1>
            <p>Gestiona los datos que LaKitchen reutiliza cuando escaneas un código de barras.</p>
          </div>
          <div className="barcode-catalog-header__actions">
            <Link href="/inventory">Volver al inventario</Link>
          </div>
        </header>

        <div className="barcode-catalog-messages">
          {errorMessage ? <p className="barcode-catalog-message barcode-catalog-message--error" role="alert">{errorMessage}</p> : null}
          {successMessage ? <p className="barcode-catalog-message barcode-catalog-message--success" role="status">{successMessage}</p> : null}
        </div>

        {!error ? (
          <p className="barcode-catalog-summary"><strong>{products.length}</strong> productos guardados</p>
        ) : null}

        {error ? (
          <section className="barcode-catalog-load-error" role="alert" aria-labelledby="barcode-catalog-error-title">
            <h2 id="barcode-catalog-error-title">No se pudo cargar el catálogo</h2>
            <p>No se pudo cargar el catálogo de productos recordados. Inténtalo de nuevo.</p>
          </section>
        ) : products.length === 0 ? (
          <section className="barcode-catalog-empty" aria-labelledby="barcode-catalog-empty-title">
            <h2 id="barcode-catalog-empty-title">Todavía no hay productos recordados</h2>
            <p>Escanea un código desde el inventario y marca la opción para recordarlo.</p>
            <Link href="/inventory">Ir al inventario</Link>
          </section>
        ) : (
          <section className="barcode-catalog-grid" aria-labelledby="barcode-catalog-title">
            {products.map((product) => (
              <article className="barcode-product" key={product.id}>
                <header className="barcode-product__header">
                  <div>
                    <h2>{product.name}</h2>
                    <p className="barcode-product__code">Código {product.barcode}</p>
                  </div>
                  <span className="barcode-product__badge">{INVENTORY_CATEGORY_LABELS[product.default_category]}</span>
                </header>

                <dl className="barcode-product__metadata">
                  <div><dt>Cantidad</dt><dd>{product.default_quantity} {product.default_unit}</dd></div>
                  <div><dt>Ubicación</dt><dd>{product.default_location ? locationLabels[product.default_location] : "Sin ubicación predeterminada"}</dd></div>
                  <div><dt>Nutrición</dt><dd>{product.nutrition_basis ? INVENTORY_NUTRITION_BASIS_LABELS[product.nutrition_basis] : "Nutrición pendiente"}</dd></div>
                </dl>

                <details className="barcode-product__details">
                  <summary>Editar datos recordados</summary>
                  <form action={updateRememberedBarcodeProductAction} className="barcode-product__form">
                    <input name="id" type="hidden" value={product.id} />
                    <fieldset className="barcode-product__fieldset">
                      <legend>Datos del producto</legend>
                      <div className="barcode-product__fields">
                        <label className="field" htmlFor={`barcode-${product.id}`}>
                          <span>Código de barras</span>
                          <input id={`barcode-${product.id}`} name="barcode" type="text" value={product.barcode} readOnly />
                        </label>
                        <label className="field" htmlFor={`barcode-name-${product.id}`}>
                          <span>Nombre</span>
                          <input id={`barcode-name-${product.id}`} name="name" type="text" maxLength={120} required defaultValue={product.name} />
                        </label>
                        <label className="field" htmlFor={`barcode-quantity-${product.id}`}>
                          <span>Cantidad</span>
                          <input id={`barcode-quantity-${product.id}`} name="default_quantity" type="number" min="0.000001" step="any" required defaultValue={product.default_quantity} />
                        </label>
                        <label className="field" htmlFor={`barcode-unit-${product.id}`}>
                          <span>Unidad</span>
                          <select id={`barcode-unit-${product.id}`} name="default_unit" required defaultValue={product.default_unit}>
                            <option value="ud">ud</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option>
                          </select>
                        </label>
                        <label className="field" htmlFor={`barcode-location-${product.id}`}>
                          <span>Ubicación</span>
                          <select id={`barcode-location-${product.id}`} name="default_location" defaultValue={product.default_location ?? ""}>
                            <option value="">Sin ubicación predeterminada</option>
                            <option value="pantry">{locationLabels.pantry}</option><option value="fridge">{locationLabels.fridge}</option><option value="freezer">{locationLabels.freezer}</option>
                          </select>
                        </label>
                        <label className="field" htmlFor={`barcode-category-${product.id}`}>
                          <span>Categoría</span>
                          <select id={`barcode-category-${product.id}`} name="default_category" required defaultValue={product.default_category}>
                            {INVENTORY_CATEGORIES.map((category) => (<option key={category} value={category}>{INVENTORY_CATEGORY_LABELS[category]}</option>))}
                          </select>
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="barcode-product__fieldset barcode-product__nutrition">
                      <legend>Información nutricional</legend>
                      <div className="barcode-product__fields">
                        <label className="field" htmlFor={`barcode-nutrition-basis-${product.id}`}>
                          <span>Base nutricional</span>
                          <select id={`barcode-nutrition-basis-${product.id}`} name="nutrition_basis" defaultValue={product.nutrition_basis ?? ""}>
                            <option value="">Sin base nutricional</option>
                            {NUTRITION_BASES.map((basis) => (<option key={basis} value={basis}>{INVENTORY_NUTRITION_BASIS_LABELS[basis]}</option>))}
                          </select>
                        </label>
                        <label className="field" htmlFor={`barcode-calories-${product.id}`}><span>Calorías</span><input id={`barcode-calories-${product.id}`} name="calories" type="number" min="0" step="any" defaultValue={product.calories ?? ""} /></label>
                        <label className="field" htmlFor={`barcode-protein-${product.id}`}><span>Proteínas (g)</span><input id={`barcode-protein-${product.id}`} name="protein_g" type="number" min="0" step="any" defaultValue={product.protein_g ?? ""} /></label>
                        <label className="field" htmlFor={`barcode-carbs-${product.id}`}><span>Carbohidratos (g)</span><input id={`barcode-carbs-${product.id}`} name="carbs_g" type="number" min="0" step="any" defaultValue={product.carbs_g ?? ""} /></label>
                        <label className="field" htmlFor={`barcode-fat-${product.id}`}><span>Grasas (g)</span><input id={`barcode-fat-${product.id}`} name="fat_g" type="number" min="0" step="any" defaultValue={product.fat_g ?? ""} /></label>
                      </div>
                    </fieldset>
                    <div className="barcode-product__actions"><button type="submit">Guardar cambios</button></div>
                  </form>
                </details>

                <form action={deleteRememberedBarcodeProductAction} className="barcode-product__delete">
                  <input name="id" type="hidden" value={product.id} />
                  <button type="submit">Eliminar</button>
                </form>
              </article>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
