"use client";

import { useEffect, useRef, useState } from "react";

import { estimateTextMealAction } from "@/app/macros/actions";
import { AiMealEstimationPreview } from "@/components/macros/AiMealEstimationPreview";
import type { TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

type State = "idle" | "estimating" | "success" | "needs-clarification" | "error";
const errors: Record<string, string> = { "invalid-input": "Describe la comida con al menos 3 caracteres.", unauthenticated: "Tu sesión ha caducado. Vuelve a iniciar sesión.", "missing-api-key": "La estimación no está disponible ahora.", "provider-timeout": "La estimación tardó demasiado. Inténtalo de nuevo.", "provider-error": "No se pudo calcular la estimación. Inténtalo de nuevo.", "invalid-ai-response": "No se pudo validar la estimación. Reformula la comida e inténtalo de nuevo.", "unexpected-error": "Ocurrió un error inesperado. Inténtalo de nuevo." };

export function TextAiMealEstimator() {
  const [description, setDescription] = useState("");
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<TextMealEstimationResult | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; requestVersion.current += 1; }, []);

  function change(value: string) { requestVersion.current += 1; setDescription(value); setResult(null); setState("idle"); }
  async function submit() {
    if (state === "estimating") return;
    const version = ++requestVersion.current;
    setState("estimating");
    try {
      const next = await estimateTextMealAction({ description });
      if (!mounted.current || version !== requestVersion.current) return;
      setResult(next);
      setState(next.status === "success" ? "success" : next.status === "needs-clarification" ? "needs-clarification" : "error");
    } catch {
      if (!mounted.current || version !== requestVersion.current) return;
      setResult({ status: "error", code: "unexpected-error" });
      setState("error");
    }
  }
  const success = result?.status === "success" ? result : null;
  return <div className="text-ai-estimator"><label className="field" htmlFor="text-ai-description"><span>Describe lo que has comido</span><textarea id="text-ai-description" value={description} onChange={(event) => change(event.target.value)} disabled={state === "estimating"} minLength={3} maxLength={2000} placeholder="240 g de pollo, 150 g de arroz cocido y una cucharadita de aceite" /><small className="text-ai-counter">{description.length}/2000</small></label><p className="muted">Incluye cantidades, unidades y estado del alimento siempre que sea posible.</p><button type="button" className="button" disabled={state === "estimating" || description.trim().length < 3} onClick={submit}>{state === "estimating" ? "Calculando estimación…" : "Calcular estimación"}</button>{state === "needs-clarification" && result?.status === "needs-clarification" ? <p className="auth-message error" role="alert">{result.message}</p> : null}{state === "error" && result?.status === "error" ? <p className="auth-message error" role="alert">{errors[result.code]}</p> : null}{success ? <AiMealEstimationPreview result={success} mealMode="text-ai" warning="Los valores pueden variar según la marca, preparación y tamaño real de las porciones." /> : null}</div>;
}
