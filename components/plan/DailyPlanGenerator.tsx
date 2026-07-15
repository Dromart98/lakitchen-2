"use client";

import { useState, useTransition } from "react";

import { generateDailyPlanAction } from "@/app/plan/actions";
import type { DailyPlanActionResult, DailyPlanFit, DailyPlanNutrition, DailyPlanPriorityMode } from "@/modules/plans/daily-plan-ai";
import { MEAL_TYPE_LABELS } from "@/modules/meals/meal-types";

const errorMessages: Record<string, string> = {
  unauthenticated: "Inicia sesión para generar tu plan.",
  "profile-required": "Completa tu perfil nutricional antes de generar un plan.",
  "insufficient-inventory": "No hay suficientes productos utilizables en tu inventario. Añade cantidades positivas con nutrición completa y sin caducar.",
  "nutrition-unavailable": "No se pudo calcular la nutrición del plan con tu inventario actual.",
  "missing-api-key": "La generación con IA no está configurada todavía.",
  "provider-timeout": "La generación ha tardado demasiado. Inténtalo de nuevo.",
  "provider-error": "No se pudo generar el plan ahora. Inténtalo más tarde.",
  "invalid-ai-response": "La IA devolvió un plan no válido. Inténtalo de nuevo.",
  "invalid-input": "Revisa las opciones seleccionadas.",
  "unexpected-error": "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
};

const fitLabels: Record<DailyPlanFit, string> = {
  close: "Muy cerca de tu objetivo",
  acceptable: "Ajuste razonable",
  far: "Se aleja de tu objetivo",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function MacroLine({ label, value }: { label: string; value: DailyPlanNutrition }) {
  return (
    <div>
      <strong>{label}</strong>
      <p className="muted">{formatNumber(value.calories)} kcal · P {formatNumber(value.protein_g)}g · C {formatNumber(value.carbs_g)}g · G {formatNumber(value.fat_g)}g</p>
    </div>
  );
}

export function DailyPlanGenerator() {
  const [priorityMode, setPriorityMode] = useState<DailyPlanPriorityMode>("balanced");
  const [maxMinutes, setMaxMinutes] = useState<15 | 30 | 45 | 60>(30);
  const [result, setResult] = useState<DailyPlanActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setResult(null);
    startTransition(async () => {
      const nextResult = await generateDailyPlanAction({ priority_mode: priorityMode, max_minutes_per_meal: maxMinutes });
      setResult(nextResult);
    });
  }

  return (
    <section className="grid cards" style={{ marginTop: 16 }}>
      <div className="card">
        <h2>Opciones</h2>
        <form onSubmit={onSubmit} className="meal-log-form">
          <label className="field" htmlFor="plan-priority">
            <span>Prioridad</span>
            <select id="plan-priority" value={priorityMode} onChange={(event) => setPriorityMode(event.target.value as DailyPlanPriorityMode)} disabled={isPending}>
              <option value="balanced">Equilibrado</option>
              <option value="expiration">Priorizar productos que caducan</option>
            </select>
          </label>
          <label className="field" htmlFor="plan-minutes">
            <span>Tiempo máximo por comida</span>
            <select id="plan-minutes" value={maxMinutes} onChange={(event) => setMaxMinutes(Number(event.target.value) as 15 | 30 | 45 | 60)} disabled={isPending}>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos</option>
            </select>
          </label>
          <button className="button" type="submit" disabled={isPending}>{isPending ? "Generando tu plan…" : "Generar plan"}</button>
        </form>
      </div>

      <div className="card">
        <h2>Vista previa</h2>
        {isPending ? <p className="muted">Generando tu plan…</p> : null}
        {result?.status === "error" ? <p className="auth-message error" role="alert">{errorMessages[result.code]}</p> : null}
        {result?.status === "needs-clarification" ? <p className="auth-message error" role="alert">{result.message}</p> : null}
        {result?.status === "success" ? (
          <div>
            <section className="card" style={{ marginTop: 12 }}>
              <h3>Resumen diario</h3>
              <p><strong>{fitLabels[result.fit]}</strong></p>
              <MacroLine label="Objetivo diario" value={result.target} />
              <MacroLine label="Total generado" value={result.total} />
              <MacroLine label="Diferencia" value={result.difference} />
            </section>
            {result.meals.map((meal) => (
              <section className="card" key={meal.meal_type} style={{ marginTop: 12 }}>
                <h3>{MEAL_TYPE_LABELS[meal.meal_type]} · {meal.title}</h3>
                <p className="muted">{meal.description}</p>
                <p><strong>Tiempo:</strong> {meal.estimated_minutes} minutos</p>
                <MacroLine label="Nutrición calculada" value={meal.nutrition} />
                <h4>Ingredientes</h4>
                <ul>{meal.ingredients.map((ingredient) => <li key={ingredient.inventory_item_id}>{formatNumber(ingredient.quantity)} {ingredient.unit} · {ingredient.name}</li>)}</ul>
                <h4>Pasos</h4>
                <ol>{meal.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </section>
            ))}
          </div>
        ) : null}
        {!isPending && !result ? <p className="muted">El plan aparecerá aquí. Es una vista previa: no se guarda, no consume inventario y no registra comidas.</p> : null}
      </div>
    </section>
  );
}
