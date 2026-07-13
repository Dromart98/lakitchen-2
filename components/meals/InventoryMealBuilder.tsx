"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  calculateMealBuilderLineNutrition,
  calculateMealBuilderTotals,
  formatMealBuilderNutritionValue,
  isMealBuilderInventoryItemEligible,
  type MealBuilderInventoryItem,
} from "@/modules/meals/meal-builder";

const MAX_MEAL_BUILDER_ROWS = 10;

type BuilderRow = {
  id: string;
  itemId: string;
  quantity: string;
};

type InventoryMealBuilderProps = {
  items: MealBuilderInventoryItem[];
};

function createRow(index: number): BuilderRow {
  return {
    id: `meal-builder-row-${index}-${Date.now()}`,
    itemId: "",
    quantity: "",
  };
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

export function InventoryMealBuilder({ items }: InventoryMealBuilderProps) {
  const eligibleItems = useMemo(() => items.filter(isMealBuilderInventoryItemEligible), [items]);
  const [rows, setRows] = useState<BuilderRow[]>(() => [createRow(0)]);

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

  function updateRow(rowId: string, values: Partial<BuilderRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, ...values } : row)));
  }

  function addRow() {
    setRows((currentRows) => {
      if (currentRows.length >= MAX_MEAL_BUILDER_ROWS) return currentRows;

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
      <section className="card">
        <p className="muted">Añade información nutricional completa a tus productos para poder componer una comida.</p>
        <Link className="button nav-button" href="/inventory">Volver al inventario</Link>
      </section>
    );
  }

  return (
    <>
      <section className="grid cards">
        {rows.map((row, index) => {
          const item = eligibleItems.find((candidate) => candidate.id === row.itemId) ?? null;
          const quantity = parseQuantity(row.quantity);
          const exceedsStock = Boolean(item && quantity !== null && quantity > item.quantity);
          const lineNutrition = item && quantity !== null
            ? calculateMealBuilderLineNutrition({ ...item, consumed_quantity: quantity })
            : null;

          return (
            <div className="card" key={row.id}>
              <h2>Producto {index + 1}</h2>
              <div className="meal-log-form">
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

                <p className="muted">
                  Unidad: <strong>{item?.unit ?? "—"}</strong>
                  <br />
                  Stock disponible: <strong>{item ? `${formatStock(item.quantity)} ${item.unit}` : "—"}</strong>
                </p>

                {exceedsStock ? (
                  <p className="auth-message error" role="alert">La cantidad supera el stock disponible.</p>
                ) : null}

                {lineNutrition ? (
                  <p className="muted">
                    Este producto aporta:<br />
                    {formatNutrition(lineNutrition.calories)} kcal · {formatNutrition(lineNutrition.protein_g)} g proteína · {formatNutrition(lineNutrition.carbs_g)} g carbohidratos · {formatNutrition(lineNutrition.fat_g)} g grasas
                  </p>
                ) : null}

                <button className="button" type="button" onClick={() => removeRow(row.id)}>
                  Eliminar producto
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {rows.length < MAX_MEAL_BUILDER_ROWS ? (
        <button className="button nav-button" type="button" onClick={addRow} style={{ marginTop: 16 }}>
          Añadir producto
        </button>
      ) : null}

      {total ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Total de la comida</h2>
          <p><strong>Calorías:</strong> {formatNutrition(total.calories)} kcal</p>
          <p><strong>Proteínas:</strong> {formatNutrition(total.protein_g)} g</p>
          <p><strong>Carbohidratos:</strong> {formatNutrition(total.carbs_g)} g</p>
          <p><strong>Grasas:</strong> {formatNutrition(total.fat_g)} g</p>
        </section>
      ) : null}
    </>
  );
}
