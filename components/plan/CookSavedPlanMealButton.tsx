"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cookSavedDailyPlanMealAction } from "@/app/plan/actions";
import type { DailyPlanMealType } from "@/modules/plans/daily-plan-ai";

const errorMessages = {
  "invalid-input": "No se pudo identificar esta comida.",
  unauthenticated: "Inicia sesión de nuevo para registrar la comida.",
  "already-completed": "Esta comida ya estaba registrada.",
  "inventory-changed": "El inventario cambió o ya no tiene cantidades suficientes para esta comida.",
  "unexpected-error": "No se pudo registrar la comida.",
} as const;

export function CookSavedPlanMealButton({ planId, mealType, completed }: {
  planId: string;
  mealType: DailyPlanMealType;
  completed: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (completed) return <p><strong>Comida registrada</strong></p>;

  function handleCook() {
    if (isPending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cookSavedDailyPlanMealAction({ plan_id: planId, meal_type: mealType });
      if (result.status === "success") {
        setMessage("Comida registrada e inventario actualizado.");
        router.refresh();
        return;
      }
      setMessage(errorMessages[result.code]);
    });
  }

  return (
    <div>
      <button className="button" type="button" disabled={isPending} onClick={handleCook}>
        {isPending ? "Registrando…" : "Cocinar y registrar"}
      </button>
      {message ? <p className={message.startsWith("Comida registrada") ? "muted" : "auth-message error"} role="status">{message}</p> : null}
    </div>
  );
}
