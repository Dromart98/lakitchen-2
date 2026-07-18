"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { addMealLogAction } from "@/app/dashboard/actions";
import { PhotoAiMealEstimator } from "@/components/macros/PhotoAiMealEstimator";
import { TextAiMealEstimator } from "@/components/macros/TextAiMealEstimator";
import { InventoryMealBuilder } from "@/components/meals/InventoryMealBuilder";
import type { MealBuilderInventoryItem } from "@/modules/meals/meal-builder";
import { MEAL_TYPE_LABELS, MEAL_TYPES } from "@/modules/meals/meal-types";

type MealMode = "manual" | "text-ai" | "photo-ai" | "ingredients";

type MacroMealRecorderProps = {
  items: MealBuilderInventoryItem[];
  initialMode?: MealMode;
  inventoryUnavailable?: boolean;
  manualErrorMessage?: string | null;
  manualSuccessMessage?: string | null;
  ingredientErrorMessage?: string | null;
  ingredientSuccessMessage?: string | null;
};

export function MacroMealRecorder({
  items,
  initialMode = "manual",
  inventoryUnavailable = false,
  manualErrorMessage,
  manualSuccessMessage,
  ingredientErrorMessage,
  ingredientSuccessMessage,
}: MacroMealRecorderProps) {
  const [mode, setMode] = useState<MealMode>(initialMode);
  const manualTab = useRef<HTMLButtonElement>(null);
  const textAiTab = useRef<HTMLButtonElement>(null);
  const photoAiTab = useRef<HTMLButtonElement>(null);
  const ingredientsTab = useRef<HTMLButtonElement>(null);

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, nextMode: MealMode) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setMode(nextMode);
    (nextMode === "manual" ? manualTab : nextMode === "text-ai" ? textAiTab : nextMode === "photo-ai" ? photoAiTab : ingredientsTab).current?.focus();
  }

  return (
    <section className="card macros-add" aria-labelledby="macros-add-title">
      <h2 id="macros-add-title">Añadir comida</h2>
      <div className="macros-modes" role="group" aria-label="Modos de registro">
        <button ref={manualTab} id="meal-mode-manual" className="macros-mode" type="button"
          aria-pressed={mode === "manual"} aria-controls="meal-panel-manual"
          onClick={() => setMode("manual")} onKeyDown={(event) => handleTabKey(event, "text-ai")}>
          Manual
        </button>
        <button ref={textAiTab} id="meal-mode-text-ai" className="macros-mode" type="button" aria-pressed={mode === "text-ai"} aria-controls="meal-panel-text-ai" onClick={() => setMode("text-ai")} onKeyDown={(event) => handleTabKey(event, "photo-ai")}>Texto IA</button>
        <button ref={photoAiTab} id="meal-mode-photo-ai" className="macros-mode" type="button" aria-pressed={mode === "photo-ai"} aria-controls="meal-panel-photo-ai" onClick={() => setMode("photo-ai")} onKeyDown={(event) => handleTabKey(event, "ingredients")}>Foto</button>
        <button ref={ingredientsTab} id="meal-mode-ingredients" className="macros-mode" type="button"
          disabled={inventoryUnavailable} aria-disabled={inventoryUnavailable}
          aria-pressed={mode === "ingredients"} aria-controls="meal-panel-ingredients"
          onClick={() => setMode("ingredients")} onKeyDown={(event) => handleTabKey(event, "manual")}>
          Ingredientes
        </button>
      </div>

      {inventoryUnavailable ? <p className="auth-message error" role="alert">No se pudo cargar tu inventario. El cálculo por ingredientes no está disponible ahora.</p> : null}

      <div id="meal-panel-manual" className="macros-mode-panel" role="region" aria-labelledby="meal-mode-manual" hidden={mode !== "manual"}>
        <p className="muted">Introduce los totales si ya conoces las calorías y macros de la comida.</p>
        {manualErrorMessage ? <p className="auth-message error" role="alert">{manualErrorMessage}</p> : null}
        {manualSuccessMessage ? <p className="auth-message success" role="status">{manualSuccessMessage}</p> : null}
        <form action={addMealLogAction} className="meal-log-form macros-meal-form">
          <input type="hidden" name="return_to" value="/macros" />
          <label className="field" htmlFor="macros-meal-name"><span>Nombre</span><input id="macros-meal-name" name="name" type="text" required placeholder="Pollo con arroz" /></label>
          <label className="field" htmlFor="macros-meal-type"><span>Tipo de comida</span><select id="macros-meal-type" name="meal_type" required defaultValue=""><option value="" disabled>Selecciona un tipo</option>{MEAL_TYPES.map((type) => <option key={type} value={type}>{MEAL_TYPE_LABELS[type]}</option>)}</select></label>
          <label className="field" htmlFor="macros-calories"><span>Calorías</span><input id="macros-calories" name="calories" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
          <label className="field" htmlFor="macros-protein"><span>Proteína (g)</span><input id="macros-protein" name="protein_g" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
          <label className="field" htmlFor="macros-carbs"><span>Carbohidratos (g)</span><input id="macros-carbs" name="carbs_g" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
          <label className="field" htmlFor="macros-fat"><span>Grasas (g)</span><input id="macros-fat" name="fat_g" type="number" min="0" step="0.1" inputMode="decimal" required defaultValue="0" /></label>
          <p className="macros-manual-note">El registro manual no descuenta productos del inventario.</p>
          <button className="button macros-submit" type="submit">Registrar comida</button>
        </form>
      </div>

      <div id="meal-panel-text-ai" className="macros-mode-panel" role="region" aria-labelledby="meal-mode-text-ai" hidden={mode !== "text-ai"}><TextAiMealEstimator /></div>

      <div id="meal-panel-photo-ai" className="macros-mode-panel" role="region" aria-labelledby="meal-mode-photo-ai" hidden={mode !== "photo-ai"}><PhotoAiMealEstimator /></div>

      <div id="meal-panel-ingredients" className="macros-mode-panel macros-mode-panel--ingredients" role="region" aria-labelledby="meal-mode-ingredients" hidden={mode !== "ingredients"}>
        {ingredientErrorMessage ? <p className="auth-message error" role="alert">{ingredientErrorMessage}</p> : null}
        {ingredientSuccessMessage ? <p className="auth-message success" role="status">{ingredientSuccessMessage}</p> : null}
        <InventoryMealBuilder items={items} returnPath="/macros" presentation="embedded" />
      </div>
    </section>
  );
}
