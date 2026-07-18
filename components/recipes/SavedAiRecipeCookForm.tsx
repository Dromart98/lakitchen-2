"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cookSavedAiRecipeAndLogMealAction } from "@/app/recipes/actions";
import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from "@/modules/meals/meal-types";
import type { SavedAiRecipeCookErrorCode } from "@/modules/recipes/saved-ai-recipe-consumption";

const ERROR_MESSAGES: Record<SavedAiRecipeCookErrorCode, string> = {
  "invalid-input": "No se pudo cocinar la receta.",
  unauthenticated: "No se pudo cocinar la receta.",
  "recipe-not-found": "No se pudo cocinar la receta.",
  "recipe-corrupt": "No se pudo cocinar la receta.",
  "recipe-stale": "Ya no tienes todos los ingredientes necesarios.",
  "insufficient-stock": "No tienes suficiente cantidad de uno o más ingredientes.",
  "expired-item": "Uno de los productos está caducado.",
  "nutrition-unavailable": "Falta información nutricional para registrar esta comida.",
  "incompatible-unit": "No se pudo cocinar la receta.",
  "too-many-items": "Esta receta supera el máximo de 20 ingredientes permitido.",
  "consumption-conflict": "No se pudo cocinar la receta.",
  "unexpected-error": "No se pudo cocinar la receta.",
};

export function SavedAiRecipeCookForm({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setMessage(null);
    setIsSuccess(false);
    startTransition(async () => {
      const result = await cookSavedAiRecipeAndLogMealAction({ recipe_id: recipeId, meal_type: mealType });
      if (result.status === "success") {
        setIsSuccess(true);
        setMessage("Receta cocinada y comida registrada.");
        router.refresh();
        return;
      }

      setIsSuccess(false);
      setMessage(ERROR_MESSAGES[result.code]);
    });
  }

  return (
    <form className="saved-recipe__cook-form" onSubmit={handleSubmit}>
      <label>
        Tipo de comida
        <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} disabled={isPending}>
          {MEAL_TYPES.map((type) => <option key={type} value={type}>{MEAL_TYPE_LABELS[type]}</option>)}
        </select>
      </label>
      <button type="submit" disabled={isPending}>{isPending ? "Cocinando…" : "Cocinar y registrar"}</button>
      {message ? <p className={isSuccess ? "success" : "error"} role={isSuccess ? "status" : "alert"}>{message}</p> : null}
    </form>
  );
}
