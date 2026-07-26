"use client";

import { useState, useTransition } from "react";

import { estimateInventoryNutritionAction } from "@/app/inventory/actions";
import { requiresInventoryNutritionAiOverwriteConfirmation, type InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";

type InventoryNutritionAiControlsProps = {
  controlId?: string;
  buttonId?: string;
  fieldIds: {
    name: string;
    quantity: string;
    unit: string;
    category: string;
    nutritionBasis: string;
    calories: string;
    proteinG: string;
    carbsG: string;
    fatG: string;
  };
};

type Message =
  | { tone: "success"; text: string; assumptions: string }
  | { tone: "warning" | "error" | "info"; text: string };

function getFieldValue(id: string) {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return element?.value ?? "";
}

function setFieldValue(id: string, value: string) {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!element) return;

  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function readCurrentInput(fieldIds: InventoryNutritionAiControlsProps["fieldIds"]): InventoryNutritionAiInput | null {
  const name = getFieldValue(fieldIds.name).trim();
  const rawQuantity = getFieldValue(fieldIds.quantity).trim();
  const unit = getFieldValue(fieldIds.unit);
  const category = getFieldValue(fieldIds.category).trim();
  const quantity = rawQuantity ? Number(rawQuantity) : null;

  if (!(unit === "ud" || unit === "g" || unit === "kg" || unit === "ml" || unit === "l")) return null;

  return {
    name,
    quantity,
    unit,
    category: category ? category as InventoryNutritionAiInput["category"] : null,
  };
}

export function InventoryNutritionAiControls({
  controlId,
  buttonId,
  fieldIds,
}: InventoryNutritionAiControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);
  const [awaitingOverwriteConfirmation, setAwaitingOverwriteConfirmation] = useState(false);

  function hasExistingNutrition() {
    return requiresInventoryNutritionAiOverwriteConfirmation({
      nutritionBasis: getFieldValue(fieldIds.nutritionBasis),
      calories: getFieldValue(fieldIds.calories),
      proteinG: getFieldValue(fieldIds.proteinG),
      carbsG: getFieldValue(fieldIds.carbsG),
      fatG: getFieldValue(fieldIds.fatG),
    });
  }

  function handleClick() {
    if (!awaitingOverwriteConfirmation && hasExistingNutrition()) {
      setAwaitingOverwriteConfirmation(true);
      setMessage({ tone: "warning", text: "Ya existen datos nutricionales. La nueva estimación los sustituirá." });
      return;
    }

    const input = readCurrentInput(fieldIds);
    setAwaitingOverwriteConfirmation(false);

    if (!input) {
      setMessage({ tone: "error", text: "Completa un nombre y una unidad válidos antes de calcular." });
      return;
    }

    startTransition(async () => {
      const result = await estimateInventoryNutritionAction(input);

      if (result.status === "success") {
        setFieldValue(fieldIds.nutritionBasis, result.estimate.nutrition_basis);
        setFieldValue(fieldIds.calories, String(result.estimate.calories));
        setFieldValue(fieldIds.proteinG, String(result.estimate.protein_g));
        setFieldValue(fieldIds.carbsG, String(result.estimate.carbs_g));
        setFieldValue(fieldIds.fatG, String(result.estimate.fat_g));
        setMessage({
          tone: "success",
          text: "Estimación realizada. Revisa los valores antes de guardar.",
          assumptions: result.estimate.assumptions,
        });
        return;
      }

      if (result.status === "needs-clarification") {
        setMessage({ tone: "info", text: result.message });
        return;
      }

      setMessage({ tone: "error", text: result.message });
    });
  }

  return (
    <div id={controlId} className="meal-log-form" aria-live="polite">
      <button id={buttonId} className="button" type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? "Calculando..." : awaitingOverwriteConfirmation ? "Sustituir valores" : "Calcular macros"}
      </button>
      <p className="muted">Los valores son orientativos. Revísalos antes de guardar.</p>
      {message ? (
        <div className={message.tone === "error" ? "auth-message error" : "auth-message success"} role={message.tone === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.tone === "success" ? (
            <p>Suposición: {message.assumptions}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
