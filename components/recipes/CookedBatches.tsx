"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from "@/modules/meals/meal-types";
import { calculateCookedBatchPortion } from "@/modules/recipes/cooked-batch-portion";
import type { ConsumeCookedBatchResult } from "@/modules/recipes/cooked-batch-consumption";
import type { SavedAiRecipeCookedBatchSnapshot } from "@/modules/recipes/saved-ai-recipe-cooked-batch";

type ConsumeAction = (input: { requestId: string; mode: "servings" | "grams"; quantity: number; mealType: MealType }) => Promise<ConsumeCookedBatchResult>;
type PublicCookedBatchSnapshot = Omit<SavedAiRecipeCookedBatchSnapshot, "updatedAt">;
export type PublicCookedBatch = { snapshot: PublicCookedBatchSnapshot; consume: ConsumeAction };
const number = (value: number, digits = 1) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(value);
const nutrition = (n: SavedAiRecipeCookedBatchSnapshot["totalNutrition"]) => `${number(n.calories)} kcal · ${number(n.proteinG)} g proteínas · ${number(n.carbsG)} g carbohidratos · ${number(n.fatG)} g grasas`;

function CookedBatchCard({ batch }: { batch: PublicCookedBatch }) {
  const router = useRouter();
  const { snapshot } = batch;
  const remainingWeight = snapshot.cookedWeightG - snapshot.consumedCookedWeightG;
  const remainingServings = snapshot.servings * remainingWeight / snapshot.cookedWeightG;
  const remaining = calculateCookedBatchPortion({ resolvedNutritionTotal: snapshot.totalNutrition, confirmedMeasurement: { rawWeightG: snapshot.rawWeightG, cookedWeightG: snapshot.cookedWeightG, servings: snapshot.servings }, consumption: { cookedWeightConsumedG: remainingWeight || snapshot.cookedWeightG } });
  const remainingNutrition = remainingWeight === 0 ? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 } : remaining.consumedNutrition;
  const exhausted = remainingWeight <= 0;
  const [mode, setMode] = useState<"servings" | "grams">("servings");
  const [quantity, setQuantity] = useState("1");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(crypto.randomUUID());
  const parsedQuantity = Number(quantity);
  const max = mode === "servings" ? remainingServings : remainingWeight;
  const valid = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= max;
  const preview = useMemo(() => {
    if (!valid) return null;
    return calculateCookedBatchPortion({ resolvedNutritionTotal: snapshot.totalNutrition, confirmedMeasurement: { rawWeightG: snapshot.rawWeightG, cookedWeightG: snapshot.cookedWeightG, servings: snapshot.servings }, consumption: mode === "servings" ? { servingsConsumed: parsedQuantity } : { cookedWeightConsumedG: parsedQuantity } });
  }, [mode, parsedQuantity, snapshot, valid]);
  function materialChange(next: () => void) { requestId.current = crypto.randomUUID(); setMessage(null); next(); }
  function submit() {
    if (!valid || pending) return;
    startTransition(async () => {
      const response = await batch.consume({ requestId: requestId.current, mode, quantity: parsedQuantity, mealType });
      if (response.status === "success") {
        requestId.current = crypto.randomUUID();
        setMessage({ kind: "success", text: `Se han registrado ${number(preview!.consumedWeightG)} g de esta comida.` });
        router.refresh();
      } else {
        const text = response.code === "batch-version-conflict" ? "Este lote cambió mientras lo estabas revisando. Comprueba la cantidad disponible." : response.code === "batch-exhausted" ? "Ya no queda comida en este lote." : response.code === "insufficient-batch" ? "No tienes cantidad suficiente en este lote." : "No se pudo registrar la porción. Comprueba los datos e inténtalo de nuevo.";
        setMessage({ kind: "error", text });
        if (["batch-version-conflict", "batch-exhausted", "insufficient-batch"].includes(response.code)) router.refresh();
      }
    });
  }
  return <article className="cooked-batch-card">
    <header><p className="recipes-eyebrow">{exhausted ? "Consumido" : "Disponible"}</p><h3>{snapshot.recipeTitle}</h3><p className="recipes-card__meta">Cocinado el {new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.createdAt))}</p></header>
    <dl className="cooked-batch-card__summary"><div><dt>Peso cocinado</dt><dd>{number(snapshot.cookedWeightG)} g</dd></div><div><dt>Quedan</dt><dd>{number(remainingWeight)} g · {number(remainingServings, 2)} raciones</dd></div><div><dt>Nutrición restante</dt><dd>{nutrition(remainingNutrition)}</dd></div></dl>
    {!exhausted ? <div className="cooked-batch-form">
      <label>Modalidad<select value={mode} disabled={pending} onChange={(e) => materialChange(() => { setMode(e.target.value as "servings" | "grams"); setQuantity("1"); })}><option value="servings">Raciones</option><option value="grams">Gramos cocinados</option></select></label>
      <label>Cantidad<input type="number" inputMode="decimal" min="0" max={max} step="any" value={quantity} disabled={pending} onChange={(e) => materialChange(() => setQuantity(e.target.value))} /></label>
      <label>Tipo de comida<select value={mealType} disabled={pending} onChange={(e) => materialChange(() => setMealType(e.target.value as MealType))}>{MEAL_TYPES.map((type) => <option key={type} value={type}>{MEAL_TYPE_LABELS[type]}</option>)}</select></label>
      {!valid && quantity !== "" ? <p className="cooking-yield-preview__error" role="alert">Introduce una cantidad positiva que no supere lo que queda.</p> : null}
      {preview ? <div className="cooked-batch-card__preview"><strong>Registrarás</strong><p>{number(preview.consumedWeightG)} g · {number(preview.consumedServings, 2)} raciones</p><p>{nutrition(preview.consumedNutrition)}</p></div> : null}
      <button type="button" disabled={!valid || pending} onClick={submit}>{pending ? "Registrando…" : "Registrar porción"}</button>
      {message ? <p className={message.kind === "error" ? "cooking-yield-preview__error" : "cooking-yield-preview__success"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p> : null}
    </div> : null}
  </article>;
}

export function CookedBatches({ batches }: { batches: PublicCookedBatch[] }) {
  return <section className="recipes-section cooked-batches" aria-labelledby="cooked-batches-title"><div className="recipes-section__heading"><div><p className="recipes-eyebrow">Listo para servir</p><h2 id="cooked-batches-title">Comida cocinada</h2><p>Registra una porción cuando la comas; el inventario ya se descontó al cocinar.</p></div></div>{batches.length === 0 ? <div className="recipes-empty"><p>Todavía no tienes comida cocinada guardada.</p></div> : <div className="cooked-batches__grid">{batches.map((batch, index) => <CookedBatchCard key={`${batch.snapshot.createdAt}-${index}`} batch={batch} />)}</div>}</section>;
}
