"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { generateDailyPlanAction, saveDailyPlanAction } from "@/app/plan/actions";
import { getDailyPlanInventoryReadiness, type DailyPlanActionResult, type DailyPlanFit, type DailyPlanInventoryExclusionReason, type DailyPlanInventorySourceItem, type DailyPlanNutrition, type DailyPlanPriorityMode } from "@/modules/plans/daily-plan-ai";
import { formatPlanDateLabel, getPlanDateOptions } from "@/modules/plans/plan-date";
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

type GeneratedSettings = {
  plan_date: string;
  priority_mode: DailyPlanPriorityMode;
  max_minutes_per_meal: 15 | 30 | 45 | 60;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function MacroLine({ label, value }: { label: string; value: DailyPlanNutrition }) {
  return (
    <div className="plan-comparison-row">
      <strong>{label}</strong>
      <p>{formatNumber(value.calories)} kcal · P {formatNumber(value.protein_g)}g · C {formatNumber(value.carbs_g)}g · G {formatNumber(value.fat_g)}g</p>
    </div>
  );
}

const exclusionMessages: Record<DailyPlanInventoryExclusionReason, { reason: string; action: string }> = {
  "non-positive-quantity": { reason: "no tiene cantidad disponible", action: "Actualiza su cantidad para poder utilizarlo." },
  expired: { reason: "está caducado", action: "Retíralo o actualiza su fecha de caducidad." },
  "missing-nutrition-basis": { reason: "falta la base nutricional", action: "Completa su información nutricional." },
  "incomplete-nutrition": { reason: "falta información nutricional", action: "Completa calorías, proteína, carbohidratos y grasas." },
  "incompatible-unit": { reason: "la unidad no es compatible con su base nutricional", action: "Corrige la unidad o la base nutricional." },
};

export function DailyPlanGenerator({ inventoryItems, todayKey }: { inventoryItems: DailyPlanInventorySourceItem[]; todayKey: string }) {
  const dateOptions = getPlanDateOptions(todayKey);
  const router = useRouter();
  const [planDate, setPlanDate] = useState(todayKey);
  const readiness = useMemo(() => getDailyPlanInventoryReadiness(inventoryItems, planDate), [inventoryItems, planDate]);
  const [priorityMode, setPriorityMode] = useState<DailyPlanPriorityMode>("balanced");
  const [maxMinutes, setMaxMinutes] = useState<15 | 30 | 45 | 60>(30);
  const [result, setResult] = useState<DailyPlanActionResult | null>(null);
  const [generatedSettings, setGeneratedSettings] = useState<GeneratedSettings | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || isSaving;

  function invalidatePreview() { setResult(null); setGeneratedSettings(null); setSaveMessage(null); }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || !readiness.canGenerate) return;
    const settings: GeneratedSettings = {
      plan_date: planDate,
      priority_mode: priorityMode,
      max_minutes_per_meal: maxMinutes,
    };
    invalidatePreview();
    startTransition(async () => {
      try {
        const nextResult = await generateDailyPlanAction(settings);
        setResult(nextResult);
        setGeneratedSettings(nextResult.status === "success" ? settings : null);
      } catch {
        setResult({ status: "error", code: "unexpected-error" });
        setGeneratedSettings(null);
      }
    });
  }

  async function handleSave(plan: Extract<DailyPlanActionResult, { status: "success" }>) {
    if (isBusy || !generatedSettings) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const saved = await saveDailyPlanAction({ ...generatedSettings, plan });
      if (saved.status === "success") { setSaveMessage(saved.code === "already-saved" ? "Este plan ya estaba guardado." : "Plan guardado."); router.refresh(); return; }
      const messages: Record<string, string> = { "date-occupied": "Ya tienes un plan guardado para ese día. Elimínalo antes de guardar otro.", "invalid-plan-date": "La fecha seleccionada ya no está disponible. Elige otra fecha.", "inventory-changed": "El inventario cambió y el plan ya no se puede guardar tal como fue generado. Genera uno nuevo.", "save-failed": "No se pudo guardar el plan.", "unexpected-error": "Ha ocurrido un error inesperado al guardar." };
      setSaveMessage(messages[saved.code] ?? "No se pudo guardar el plan.");
    } catch { setSaveMessage("Ha ocurrido un error inesperado al guardar."); } finally { setIsSaving(false); }
  }

  return (
    <section className="plan-generator" aria-label="Generador de plan diario">
      <aside className="plan-readiness" aria-labelledby="plan-readiness-title">
        <h2 id="plan-readiness-title">Preparación del inventario</h2>
        <dl><div><dt>Productos disponibles</dt><dd>{readiness.availableCount}</dd></div><div><dt>Productos utilizables</dt><dd>{readiness.usable.length}</dd></div><div><dt>Productos que necesitan revisión</dt><dd>{readiness.excluded.length}</dd></div></dl>
        {readiness.excluded.length ? <ul className="plan-readiness__excluded">{readiness.excluded.map(({ item, reason }) => <li key={item.id}><strong>{item.name} — {exclusionMessages[reason].reason}</strong><span>{exclusionMessages[reason].action}</span></li>)}</ul> : null}
        {!readiness.canGenerate ? <p className="auth-message error" role="alert">Necesitas al menos dos productos con cantidad positiva, nutrición completa, unidad compatible y sin caducar. No se llamará a la IA hasta entonces.</p> : null}
        {readiness.hasLimitedVariety ? <p className="plan-readiness__warning">Tu inventario utilizable tiene poca variedad. Puedes intentar generar el plan, pero quizá no sea posible crear cuatro comidas equilibradas.</p> : null}
        <a className="button" href="/inventory">Revisar productos del inventario</a>
      </aside>
      <div className="plan-options" aria-labelledby="plan-options-title">
        <div className="plan-section-heading">
          <span className="plan-step">Paso 1</span>
          <div>
            <h2 id="plan-options-title">Configura tu día</h2>
            <p>Elige cómo quieres aprovechar tu inventario y cuánto tiempo dedicar a cada comida.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="plan-options__form">
          <label className="field" htmlFor="plan-date"><span>Fecha del plan</span><select id="plan-date" value={planDate} disabled={isBusy} onChange={(event) => { setPlanDate(event.target.value); invalidatePreview(); }}>{dateOptions.map((date) => <option key={date} value={date}>{formatPlanDateLabel(date, todayKey)}</option>)}</select></label>
          <p className="plan-inventory-notice">El plan usa el inventario disponible ahora y las fechas de caducidad registradas. Los productos no quedan reservados.</p>
          <label className="field" htmlFor="plan-priority">
            <span>Prioridad</span>
            <select id="plan-priority" value={priorityMode} onChange={(event) => { setPriorityMode(event.target.value as DailyPlanPriorityMode); invalidatePreview(); }} disabled={isBusy}>
              <option value="balanced">Equilibrado</option>
              <option value="expiration">Priorizar productos que caducan</option>
            </select>
          </label>
          <label className="field" htmlFor="plan-minutes">
            <span>Tiempo máximo por comida</span>
            <select id="plan-minutes" value={maxMinutes} onChange={(event) => { setMaxMinutes(Number(event.target.value) as 15 | 30 | 45 | 60); invalidatePreview(); }} disabled={isBusy}>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos</option>
            </select>
          </label>
          <button className="button plan-options__submit" type="submit" disabled={isBusy || !readiness.canGenerate}>{isPending ? "Generando tu plan…" : "Generar plan para este día"}</button>
        </form>
      </div>

      <div className="plan-preview" aria-labelledby="plan-preview-title">
        <div className="plan-section-heading">
          <span className="plan-step">Paso 2</span>
          <div>
            <h2 id="plan-preview-title">Vista previa</h2>
            <p>Revisa el equilibrio del día y cada receta antes de guardar una copia.</p>
          </div>
        </div>
        <div className="plan-preview__messages">
          {isPending ? <p className="plan-status" role="status">Generando tu plan…</p> : null}
          {isSaving ? <p className="plan-status" role="status">Guardando el plan…</p> : null}
          {saveMessage ? <p className={saveMessage === "Plan guardado." || saveMessage === "Este plan ya estaba guardado." ? "plan-status" : "auth-message error"} role={saveMessage === "Plan guardado." || saveMessage === "Este plan ya estaba guardado." ? "status" : "alert"}>{saveMessage}</p> : null}
        {result?.status === "error" ? <p className="auth-message error" role="alert">{errorMessages[result.code]}</p> : null}
        {result?.status === "needs-clarification" ? <p className="auth-message error" role="alert">{result.message}</p> : null}
        </div>
        {result?.status === "success" ? (
          <div className="plan-result">
            <section className="plan-summary" aria-labelledby="plan-summary-title">
              <div className="plan-summary__heading">
                <div>
                  <span className="plan-summary__fit">{fitLabels[result.fit]}</span>
                  <h3 id="plan-summary-title">Plan para el {formatPlanDateLabel(generatedSettings?.plan_date ?? planDate, todayKey)}</h3>
                </div>
                <div className="plan-summary__calories"><strong>{formatNumber(result.total.calories)}</strong><span>kcal generadas</span></div>
              </div>
              <div className="plan-summary__macros">
                <p><span>Proteínas</span><strong>{formatNumber(result.total.protein_g)} g</strong></p>
                <p><span>Carbohidratos</span><strong>{formatNumber(result.total.carbs_g)} g</strong></p>
                <p><span>Grasas</span><strong>{formatNumber(result.total.fat_g)} g</strong></p>
              </div>
              <div className="plan-comparisons">
                <MacroLine label="Objetivo diario" value={result.target} />
                <MacroLine label="Total generado" value={result.total} />
                <MacroLine label="Diferencia" value={result.difference} />
              </div>
              <div className="plan-save-action">
                <button className="button" type="button" disabled={isBusy || !generatedSettings} onClick={() => handleSave(result)}>
                  {isSaving ? "Guardando…" : "Guardar plan"}
                </button>
                <p>Guardar crea una copia del plan. No descuenta inventario ni registra comidas.</p>{planDate !== todayKey ? <p>Antes de cocinar, LaKitchen comprobará de nuevo las cantidades disponibles.</p> : null}
              </div>
            </section>
            <div className="plan-meals">
              {result.meals.map((meal) => (
                <article className="plan-meal" key={meal.meal_type}>
                  <span className="plan-meal__type">{MEAL_TYPE_LABELS[meal.meal_type]}</span>
                  <h3>{meal.title}</h3>
                  <p className="plan-meal__description">{meal.description}</p>
                  <div className="plan-meal__meta"><span><strong>Tiempo</strong>{meal.estimated_minutes} minutos</span><span><strong>Calorías</strong>{formatNumber(meal.nutrition.calories)} kcal</span></div>
                  <div className="plan-meal__macros"><span>P {formatNumber(meal.nutrition.protein_g)} g</span><span>C {formatNumber(meal.nutrition.carbs_g)} g</span><span>G {formatNumber(meal.nutrition.fat_g)} g</span></div>
                  <details className="plan-meal__details">
                    <summary>Ingredientes y pasos</summary>
                    <h4>Ingredientes</h4>
                    <ul>{meal.ingredients.map((ingredient) => <li key={ingredient.inventory_item_id}>{formatNumber(ingredient.quantity)} {ingredient.unit} · {ingredient.name}</li>)}</ul>
                    <h4>Pasos</h4>
                    <ol>{meal.steps.map((step, index) => <li key={`${meal.meal_type}-${index}`}>{step}</li>)}</ol>
                  </details>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {!isPending && !result ? <div className="plan-preview__empty"><strong>Tu plan aparecerá aquí</strong><p>Elige tus preferencias y genera el día cuando estés listo. Generar o revisar el plan no consume inventario ni registra comidas.</p></div> : null}
      </div>
    </section>
  );
}
