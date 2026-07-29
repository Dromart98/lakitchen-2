import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  FOOD_QUANTITY_CANONICAL_UNITS,
  FOOD_QUANTITY_MEASURE_KINDS,
  FOOD_QUANTITY_MEASURE_KIND_LABELS,
  toFoodQuantityEquivalence,
  type FoodQuantityEquivalence,
  type FoodQuantityMeasureKind,
} from "@/modules/units/food-quantity-equivalence";
import { mergeCandidateFoodIdentityIds, toFoodIdentityOption, type FoodIdentityOption } from "@/modules/units/food-quantity-equivalence-management";
import { createFoodQuantityEquivalenceAction, deleteFoodQuantityEquivalenceAction, updateFoodQuantityEquivalenceAction } from "./actions";

export const dynamic = "force-dynamic";
const EQUIVALENCE_COLUMNS = "id, user_id, food_catalog_item_id, measure_kind, variant_key, display_label, canonical_quantity, canonical_unit, source, user_confirmed, updated_at";
const errorMessages: Record<string, string> = {
  validation: "Revisa los datos de la medida.",
  "food-unavailable": "Este alimento ya no está disponible.",
  conflict: "La medida cambió mientras la estabas editando. Recarga la página y revisa los datos.",
  duplicate: "Ya existe una medida con ese nombre para este alimento. Edítala o usa un nombre más específico.",
  "save-failed": "No se pudo guardar la medida. Inténtalo de nuevo.",
  "delete-failed": "No se pudo eliminar la medida. Inténtalo de nuevo.",
};
const successMessages: Record<string, string> = { created: "Medida creada.", reviewed: "Medida revisada.", deleted: "Medida eliminada." };

function measureCountLabel(count: number) { return `${count} ${count === 1 ? "medida guardada" : "medidas guardadas"}`; }
function measureSentence(kind: FoodQuantityMeasureKind, quantity: number, unit: string) {
  return `1 ${FOOD_QUANTITY_MEASURE_KIND_LABELS[kind].toLocaleLowerCase("es-ES")} = ${quantity} ${unit}`;
}

function MeasureFields({ prefix, defaults }: { prefix: string; defaults?: FoodQuantityEquivalence }) {
  return <div className="equivalence-fields">
    <label className="field" htmlFor={`${prefix}-label`}><span>Nombre de la medida</span><input id={`${prefix}-label`} name="display_label" maxLength={120} required defaultValue={defaults?.displayLabel} placeholder="Lata de 143 g" /><small>Lata de 143 g, Paquete de 6 tortillas o Ración habitual.</small></label>
    <label className="field" htmlFor={`${prefix}-quantity`}><span>Cantidad equivalente</span><input id={`${prefix}-quantity`} name="canonical_quantity" type="number" min="0.000001" step="any" required defaultValue={defaults?.canonicalQuantity} /></label>
    <label className="field" htmlFor={`${prefix}-unit`}><span>Unidad equivalente</span><select id={`${prefix}-unit`} name="canonical_unit" required defaultValue={defaults?.canonicalUnit ?? "g"}>{FOOD_QUANTITY_CANONICAL_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
  </div>;
}

function CreateForm({ foods, food }: { foods: readonly FoodIdentityOption[]; food?: FoodIdentityOption }) {
  const prefix = food ? `add-${food.id}` : "create-equivalence";
  return <form action={createFoodQuantityEquivalenceAction} className="equivalence-form">
    {food ? <input type="hidden" name="food_catalog_item_id" value={food.id} /> : <label className="field" htmlFor={`${prefix}-food`}><span>Alimento</span><select id={`${prefix}-food`} name="food_catalog_item_id" required>{foods.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>}
    <label className="field" htmlFor={`${prefix}-kind`}><span>Tipo de medida</span><select id={`${prefix}-kind`} name="measure_kind" required>{FOOD_QUANTITY_MEASURE_KINDS.map(kind => <option key={kind} value={kind}>{FOOD_QUANTITY_MEASURE_KIND_LABELS[kind]}</option>)}</select></label>
    <MeasureFields prefix={prefix} />
    <button type="submit">Guardar medida</button>
  </form>;
}

export default async function FoodQuantityEquivalencesPage({ searchParams }: { searchParams?: Promise<{ equivalenceError?: string; equivalenceSuccess?: string }> }) {
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "food quantity equivalences");
  const [equivalenceResult, inventoryResult, params] = await Promise.all([
    (supabase as any).from("food_quantity_equivalences").select(EQUIVALENCE_COLUMNS).eq("user_id", user.id),
    (supabase as any).from("inventory_items").select("food_catalog_item_id").eq("user_id", user.id).not("food_catalog_item_id", "is", null),
    searchParams,
  ]);
  const loadError = equivalenceResult.error || inventoryResult.error;
  if (loadError) console.warn("Could not load food quantity equivalence data:", loadError.message);

  let hasCorruptRows = false;
  const equivalences: FoodQuantityEquivalence[] = [];
  if (!loadError) for (const row of equivalenceResult.data ?? []) {
    const value = toFoodQuantityEquivalence(row);
    if (value) equivalences.push(value); else { hasCorruptRows = true; console.warn("Ignored corrupt food quantity equivalence row on server.", { row }); }
  }
  const candidateIds = mergeCandidateFoodIdentityIds(inventoryResult.data ?? [], equivalences.map(item => item.foodCatalogItemId));
  let identityError: { message: string } | null = null;
  let foods: FoodIdentityOption[] = [];
  if (!loadError && candidateIds.length > 0) {
    const result = await (supabase as any).from("food_catalog_items").select("id, display_name, normalized_name").eq("user_id", user.id).in("id", candidateIds);
    identityError = result.error;
    if (identityError) console.warn("Could not load food identities for quantity equivalences:", identityError.message);
    else foods = (result.data ?? []).map(toFoodIdentityOption).filter((item: FoodIdentityOption | null): item is FoodIdentityOption => item !== null).sort((a: FoodIdentityOption, b: FoodIdentityOption) => a.displayName.localeCompare(b.displayName, "es"));
  }
  const pageLoadError = Boolean(loadError || identityError);
  const foodById = new Map(foods.map(food => [food.id, food]));
  const grouped = foods.map(food => ({ food, equivalences: equivalences.filter(item => item.foodCatalogItemId === food.id).sort((a, b) => a.measureKind.localeCompare(b.measureKind) || a.displayLabel.localeCompare(b.displayLabel, "es") || a.variantKey.localeCompare(b.variantKey)) }));
  const errorMessage = params?.equivalenceError ? errorMessages[params.equivalenceError] : null;
  const successMessage = params?.equivalenceSuccess ? successMessages[params.equivalenceSuccess] : null;

  return <AppShell><main className="equivalences-page">
    <header className="equivalences-header"><div><span className="equivalences-eyebrow">Inventario</span><h1>Medidas habituales</h1><p>Define cuánto pesa o contiene una unidad, lata, paquete, cucharada o ración de tus alimentos.</p></div><Link href="/inventory">Volver al inventario</Link></header>
    <p className="equivalences-note">Estas medidas no cambian tu inventario automáticamente. Podrás revisarlas antes de utilizarlas.</p>
    <div className="equivalences-messages">{errorMessage ? <p role="alert" className="equivalence-message equivalence-message--error">{errorMessage}</p> : null}{successMessage ? <p role="status" className="equivalence-message equivalence-message--success">{successMessage}</p> : null}{hasCorruptRows ? <p role="alert" className="equivalence-message equivalence-message--error">Algunas medidas necesitan volver a cargarse. Inténtalo de nuevo.</p> : null}</div>
    {pageLoadError ? <section className="equivalences-empty" role="alert"><h2>No se pudieron cargar las medidas</h2><p>Inténtalo de nuevo o vuelve a Inventario.</p><div className="equivalence-actions"><Link href="/inventory/equivalences">Volver a cargar</Link><Link href="/inventory">Ir al inventario</Link></div></section>
    : foods.length === 0 ? <section className="equivalences-empty"><h2>Todavía no hay alimentos preparados para guardar medidas</h2><p>Añade un producto o revisa su información nutricional desde Inventario.</p><Link href="/inventory">Ir al inventario</Link></section>
    : <>
      <details className="equivalence-create"><summary>Añadir una medida habitual</summary><div><p>Guarda una forma cotidiana de medir uno de tus alimentos.</p><CreateForm foods={foods} /></div></details>
      {equivalences.length === 0 ? <p className="equivalences-zero" role="status">Aún no tienes medidas guardadas. Crea la primera cuando quieras.</p> : null}
      <section className="equivalence-food-grid" aria-label="Medidas por alimento">{grouped.map(({ food, equivalences: items }) => <article className="equivalence-food" key={food.id}>
        <header><div><h2>{food.displayName}</h2><p>{measureCountLabel(items.length)}</p></div></header>
        {items.length > 0 ? <div className="equivalence-list">{items.map(item => <section className="equivalence-item" key={item.id}>
          <div className="equivalence-item__summary"><div><h3>{item.displayLabel}</h3><p>{measureSentence(item.measureKind, item.canonicalQuantity, item.canonicalUnit)}</p></div><span>{item.state === "confirmed" ? "Revisada por ti" : "Pendiente de revisar"}</span></div>
          <details><summary>{item.state === "confirmed" ? "Editar medida" : "Revisar medida"}</summary><form action={updateFoodQuantityEquivalenceAction} className="equivalence-form">
            <input type="hidden" name="id" value={item.id} /><input type="hidden" name="food_catalog_item_id" value={item.foodCatalogItemId} /><input type="hidden" name="measure_kind" value={item.measureKind} /><input type="hidden" name="variant_key" value={item.variantKey} /><input type="hidden" name="updated_at" value={item.updatedAt} />
            <MeasureFields prefix={`edit-${item.id}`} defaults={item} /><button type="submit">Guardar revisión</button>
          </form></details>
          <details className="equivalence-delete"><summary>Eliminar medida</summary><p>Esta acción solo elimina esta medida. El alimento y tu inventario no cambiarán.</p><form action={deleteFoodQuantityEquivalenceAction}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="updated_at" value={item.updatedAt} /><button type="submit">Sí, eliminar medida</button></form></details>
        </section>)}</div> : <p className="equivalence-food__empty">No hay medidas guardadas para este alimento.</p>}
        <details className="equivalence-add"><summary>Añadir otra medida</summary><CreateForm foods={foods} food={foodById.get(food.id)!} /></details>
      </article>)}</section>
    </>}
  </main></AppShell>;
}
