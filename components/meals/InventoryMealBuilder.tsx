"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { consumeMealBuilderAndLogMealAction } from "@/app/meal-builder/actions";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import {
  MAX_MEAL_BUILDER_LINES,
  calculateMealBuilderLineNutrition,
  calculateMealBuilderTotals,
  createMealBuilderConsumptionPayload,
  formatMealBuilderNutritionValue,
  isMealBuilderInventoryItemEligible,
  type MealBuilderInventoryItem,
  type MealBuilderReturnPath,
  type RepeatedMealBuilderDraftLine,
  type RepeatedMealBuilderUnavailableItem,
} from "@/modules/meals/meal-builder";
import { MEAL_TYPE_LABELS, MEAL_TYPES, isMealType, type MealType } from "@/modules/meals/meal-types";


const UNAVAILABLE_REASON_LABELS: Record<RepeatedMealBuilderUnavailableItem["reason"], string> = {
  missing: "Ya no está en tu inventario.",
  incompatible: "El producto existe, pero necesita información nutricional válida.",
};

type BuilderRow = {
  id: string;
  itemId: string;
  quantity: string;
};

type InventoryMealBuilderProps = {
  items: MealBuilderInventoryItem[];
  initialMealName?: string;
  initialMealType?: MealType | "";
  initialRows?: RepeatedMealBuilderDraftLine[];
  unavailableItems?: RepeatedMealBuilderUnavailableItem[];
  returnPath?: MealBuilderReturnPath;
  presentation?: "page" | "embedded";
};

function createRow(index: number): BuilderRow {
  return {
    id: `meal-builder-row-${index}-${Date.now()}`,
    itemId: "",
    quantity: "",
  };
}

function createInitialRows(initialRows: RepeatedMealBuilderDraftLine[] | undefined): BuilderRow[] {
  const seenItemIds = new Set<string>();
  const rows: BuilderRow[] = [];

  for (const row of initialRows ?? []) {
    if (!row.itemId || seenItemIds.has(row.itemId) || rows.length >= MAX_MEAL_BUILDER_LINES) continue;

    seenItemIds.add(row.itemId);
    rows.push({
      id: `meal-builder-initial-row-${rows.length}-${row.itemId}`,
      itemId: row.itemId,
      quantity: row.quantity,
    });
  }

  return rows.length ? rows : [createRow(0)];
}

function parseQuantity(value: string): number | null {
  if (!value.trim()) return null;

  const quantity = Number(value);

  return Number.isFinite(quantity) ? quantity : null;
}

function formatNutrition(value: number): string {
  return formatMealBuilderNutritionValue(value) ?? "";
}

function formatStock(value: number): string {
  return formatMealBuilderNutritionValue(value) ?? String(value);
}

function UnavailableItemsCard({ items }: { items: RepeatedMealBuilderUnavailableItem[] }) {
  if (!items.length) return null;

  return (
    <aside className="meal-builder-unavailable" aria-labelledby="unavailable-products-title">
      <div>
        <p className="meal-builder-step">Aviso</p>
        <h2 id="unavailable-products-title">Productos que debes revisar</h2>
      </div>
      <ul className="meal-builder-unavailable__list">
        {items.map((item) => (
          <li key={`${item.sourceInventoryItemId}-${item.reason}`}>
            <strong>{item.productName}</strong> — {formatStock(item.consumedQuantity)} {item.unit}
            <span>{UNAVAILABLE_REASON_LABELS[item.reason]}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function InventoryMealBuilder({
  items,
  initialMealName = "",
  initialMealType = "",
  initialRows,
  unavailableItems = [],
  returnPath = "/macros",
  presentation = "embedded",
}: InventoryMealBuilderProps) {
  const eligibleItems = useMemo(() => items.filter(isMealBuilderInventoryItemEligible), [items]);
  const [rows, setRows] = useState<BuilderRow[]>(() => createInitialRows(initialRows));
  const [mealName, setMealName] = useState(initialMealName);
  const [mealType, setMealType] = useState<MealType | "">(initialMealType);

  const selectedItemIds = useMemo(
    () => new Set(rows.map((row) => row.itemId).filter(Boolean)),
    [rows],
  );

  const selectedLines = useMemo(() => {
    const lines = [];

    for (const row of rows) {
      const item = eligibleItems.find((candidate) => candidate.id === row.itemId);
      const consumedQuantity = parseQuantity(row.quantity);

      if (!item || consumedQuantity === null) return null;

      lines.push({ ...item, consumed_quantity: consumedQuantity });
    }

    return lines;
  }, [eligibleItems, rows]);

  const total = useMemo(() => (selectedLines ? calculateMealBuilderTotals(selectedLines) : null), [selectedLines]);
  const consumptionPayload = useMemo(
    () => (selectedLines ? createMealBuilderConsumptionPayload(selectedLines) : null),
    [selectedLines],
  );
  const canSubmitMeal = Boolean(mealName.trim() && isMealType(mealType) && total && consumptionPayload);

  function updateRow(rowId: string, values: Partial<BuilderRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, ...values } : row)));
  }

  function addRow() {
    setRows((currentRows) => {
      if (currentRows.length >= MAX_MEAL_BUILDER_LINES) return currentRows;

      return [...currentRows, createRow(currentRows.length)];
    });
  }

  function removeRow(rowId: string) {
    setRows((currentRows) => {
      if (currentRows.length === 1) return [createRow(0)];

      return currentRows.filter((row) => row.id !== rowId);
    });
  }

  if (!eligibleItems.length) {
    return (
      <>
        <UnavailableItemsCard items={unavailableItems} />
        <section className={`meal-builder-empty meal-builder-empty--${presentation}`}>
          <p className="meal-builder-step">Inventario no disponible</p>
          <h2>{presentation === "embedded" ? "Aún no hay productos listos para calcular" : "Aún no hay productos listos para usar"}</h2>
          <p>Para calcular una comida, los productos necesitan nutrición completa, base nutricional, unidad compatible y cantidad positiva.</p>
          <Link href="/inventory">Revisar el inventario</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <UnavailableItemsCard items={unavailableItems} />

      <div className={`meal-builder-workspace meal-builder-workspace--${presentation}`}>
      <section className="meal-builder-products" aria-labelledby="meal-builder-products-title">
        <div className="meal-builder-section-heading">
          <div>
            <p className="meal-builder-step">Paso 1</p>
            <h2 id="meal-builder-products-title">¿Qué vas a comer?</h2>
          </div>
          <p>Selecciona cada producto e indica la cantidad.</p>
        </div>
        <div className="meal-builder-products__list">
        {rows.map((row, index) => {
          const item = eligibleItems.find((candidate) => candidate.id === row.itemId) ?? null;
          const quantity = parseQuantity(row.quantity);
          const exceedsStock = Boolean(item && quantity !== null && quantity > item.quantity);
          const lineNutrition = item && quantity !== null
            ? calculateMealBuilderLineNutrition({ ...item, consumed_quantity: quantity })
            : null;

          return (
            <article className="meal-builder-row" key={row.id}>
              <div className="meal-builder-row__heading">
                <h3><span>{index + 1}</span> Producto</h3>
                <button className="meal-builder-remove" type="button" onClick={() => removeRow(row.id)}>Eliminar</button>
              </div>
              <div className="meal-builder-row__fields">
                <label className="field" htmlFor={`meal-builder-product-${row.id}`}>
                  <span>Producto</span>
                  <select
                    id={`meal-builder-product-${row.id}`}
                    value={row.itemId}
                    onChange={(event) => updateRow(row.id, { itemId: event.target.value })}
                  >
                    <option value="">Selecciona un producto</option>
                    {eligibleItems.map((candidate) => {
                      const isSelectedElsewhere = selectedItemIds.has(candidate.id) && candidate.id !== row.itemId;

                      return (
                        <option disabled={isSelectedElsewhere} key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="field" htmlFor={`meal-builder-quantity-${row.id}`}>
                  <span>Cantidad</span>
                  <input
                    id={`meal-builder-quantity-${row.id}`}
                    min="0"
                    inputMode="decimal"
                    type="number"
                    step="any"
                    value={row.quantity}
                    onChange={(event) => updateRow(row.id, { quantity: event.target.value })}
                    placeholder="0"
                  />
                </label>

                <div className="meal-builder-row__details" aria-live="polite">
                  <p><span>Unidad</span><strong>{item?.unit ?? "—"}</strong></p>
                  <p><span>Stock disponible</span><strong>{item ? `${formatStock(item.quantity)} ${item.unit}` : "—"}</strong></p>
                </div>

                {exceedsStock ? (
                  <p className="meal-builder-stock-warning" role="alert">La cantidad supera el stock disponible.</p>
                ) : null}

                {lineNutrition ? (
                  <div className="meal-builder-line-nutrition">
                    <span>Aporte de esta línea</span>
                    <strong>{formatNutrition(lineNutrition.calories)} kcal</strong>
                    <p>{formatNutrition(lineNutrition.protein_g)} g proteína · {formatNutrition(lineNutrition.carbs_g)} g carbohidratos · {formatNutrition(lineNutrition.fat_g)} g grasas</p>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
        </div>

      {rows.length < MAX_MEAL_BUILDER_LINES ? (
        <button className="meal-builder-add" type="button" onClick={addRow}>
          Añadir otro producto
        </button>
      ) : null}
      </section>

      <section className="meal-builder-summary" aria-labelledby="meal-builder-summary-title">
        <p className="meal-builder-step">Paso 2</p>
        <h2 id="meal-builder-summary-title">Total de la comida</h2>
        {total ? <>
          <div className="meal-builder-summary__calories"><strong>{formatNutrition(total.calories)}</strong><span>kcal</span></div>
          <div className="meal-builder-summary__macros">
            <p><span>Proteínas</span><strong>{formatNutrition(total.protein_g)} g</strong></p>
            <p><span>Carbohidratos</span><strong>{formatNutrition(total.carbs_g)} g</strong></p>
            <p><span>Grasas</span><strong>{formatNutrition(total.fat_g)} g</strong></p>
          </div>
        </> : <p className="meal-builder-summary__empty">Añade productos y cantidades para ver el total de tu comida.</p>}
      </section>

      <section className="meal-builder-registration" aria-labelledby="meal-builder-registration-title">
        <p className="meal-builder-step">Paso 3</p>
        <h2 id="meal-builder-registration-title">Guardar esta comida</h2>
        <form action={consumeMealBuilderAndLogMealAction} className="meal-log-form">
          <label className="field" htmlFor="meal-builder-meal-name">
            <span>Nombre de la comida</span>
            <input
              id="meal-builder-meal-name"
              maxLength={120}
              name="meal_name"
              required
              type="text"
              value={mealName}
              onChange={(event) => setMealName(event.target.value)}
              placeholder="Ej. Bowl de pollo"
            />
          </label>

          <label className="field" htmlFor="meal-builder-meal-type">
            <span>Tipo de comida</span>
            <select
              id="meal-builder-meal-type"
              name="meal_type"
              required
              value={mealType}
              onChange={(event) => setMealType(event.target.value as MealType | "")}
            >
              <option value="">Selecciona un tipo</option>
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MEAL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <input name="lines" type="hidden" value={JSON.stringify(consumptionPayload ?? [])} />
          <input name="return_to" type="hidden" value={returnPath} />

          <p className="meal-builder-registration__note">
            Al confirmar, las cantidades seleccionadas se descontarán del inventario y se registrará una única comida.
          </p>

          <PendingSubmitButton
            className="button meal-builder-submit"
            disabled={!canSubmitMeal}
            idleLabel={presentation === "embedded" ? "Registrar comida y descontar inventario" : "Registrar comida"}
            pendingLabel={presentation === "embedded" ? "Registrando y descontando…" : "Registrando comida…"}
          />
        </form>
      </section>
      </div>
    </>
  );
}
