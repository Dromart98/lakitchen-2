"use client";

import { useEffect, useRef, useState } from "react";

import { estimateTextMealAction } from "@/app/macros/actions";
import { AiMealEstimationPreview } from "@/components/macros/AiMealEstimationPreview";
import { usePersistentSpeechRecognition } from "@/components/voice/usePersistentSpeechRecognition";
import {
  mergeVoiceTranscript,
  TEXT_AI_DESCRIPTION_MAX_LENGTH,
} from "@/modules/voice/browser-speech-recognition";
import type { MealBuilderInventoryItem } from "@/modules/meals/meal-builder";
import type { TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

type State = "idle" | "estimating" | "success" | "needs-clarification" | "error";
type TextAiMealEstimatorProps = {
  active?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  items: MealBuilderInventoryItem[];
  inventoryUnavailable: boolean;
};

const errors: Record<string, string> = {
  "invalid-input": "Describe la comida con al menos 3 caracteres.",
  unauthenticated: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
  "missing-api-key": "La estimación no está disponible ahora.",
  "daily-ai-cost-limit": "Has alcanzado el límite diario de funciones con IA. Podrás volver a usarlas mañana.",
  "daily-ai-limit": "Has alcanzado el límite de funciones con IA de hoy. Podrás volver a usarlas mañana.",
  "ai-access-unavailable": "Las funciones con IA no están disponibles ahora. Inténtalo más tarde.",
  "ai-feature-disabled": "Esta función no está disponible.",
  "provider-timeout": "La estimación tardó demasiado. Inténtalo de nuevo.",
  "provider-error": "No se pudo calcular la estimación. Inténtalo de nuevo.",
  "invalid-ai-response": "No se pudo validar la estimación. Reformula la comida e inténtalo de nuevo.",
  "unexpected-error": "Ocurrió un error inesperado. Inténtalo de nuevo.",
};

export function TextAiMealEstimator({
  active = true,
  errorMessage,
  successMessage,
  items,
  inventoryUnavailable,
}: TextAiMealEstimatorProps) {
  const [description, setDescription] = useState("");
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<TextMealEstimationResult | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLimitNotice, setVoiceLimitNotice] = useState(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const descriptionRef = useRef(description);
  descriptionRef.current = description;

  const { listening, supported, startListening, stopListening } = usePersistentSpeechRecognition({
    onFinalTranscript: (transcript) => {
      const unbounded = mergeVoiceTranscript(
        descriptionRef.current,
        transcript,
        Number.MAX_SAFE_INTEGER,
      );
      const merged = mergeVoiceTranscript(
        descriptionRef.current,
        transcript,
        TEXT_AI_DESCRIPTION_MAX_LENGTH,
      );
      change(merged);
      setVoiceLimitNotice(merged.length < unbounded.length);
    },
    onError: setVoiceError,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    if (active) return;
    stopListening();
    setVoiceError(null);
    setVoiceLimitNotice(false);
  }, [active, stopListening]);

  function change(value: string) {
    const limitedValue = value.slice(0, TEXT_AI_DESCRIPTION_MAX_LENGTH);
    requestVersion.current += 1;
    descriptionRef.current = limitedValue;
    setDescription(limitedValue);
    setResult(null);
    setState("idle");
    setVoiceLimitNotice(false);
  }

  function startDictation() {
    if (!active || !supported || state === "estimating") return;
    setVoiceError(null);
    setVoiceLimitNotice(false);
    startListening();
  }

  function clearDescription() {
    stopListening();
    setVoiceError(null);
    change("");
  }

  async function submit() {
    if (state === "estimating" || description.trim().length < 3) return;
    stopListening();
    const version = ++requestVersion.current;
    setResult(null);
    setState("estimating");
    try {
      const next = await estimateTextMealAction({ description });
      if (!mounted.current || version !== requestVersion.current) return;
      setResult(next);
      setState(
        next.status === "success"
          ? "success"
          : next.status === "needs-clarification"
            ? "needs-clarification"
            : "error",
      );
    } catch {
      if (!mounted.current || version !== requestVersion.current) return;
      setResult({ status: "error", code: "unexpected-error" });
      setState("error");
    }
  }

  const success = result?.status === "success" ? result : null;

  return (
    <div className="text-ai-estimator" onSubmitCapture={() => stopListening()}>
      {errorMessage ? <p className="auth-message error" role="alert">{errorMessage}</p> : null}
      {successMessage ? <p className="auth-message success" role="status">{successMessage}</p> : null}
      <label className="field" htmlFor="text-ai-description">
        <span>Describe lo que has comido</span>
        <div className="text-ai-description-row">
          <textarea
            id="text-ai-description"
            value={description}
            onChange={(event) => change(event.target.value)}
            disabled={state === "estimating"}
            minLength={3}
            maxLength={TEXT_AI_DESCRIPTION_MAX_LENGTH}
            placeholder="240 g de pollo, 150 g de arroz cocido y una cucharadita de aceite"
          />
        </div>
      </label>
      <div className="text-ai-composer-actions">
        <button
          type="button"
          className={`voice-dictation-button${listening ? " is-listening" : ""}`}
          aria-pressed={listening}
          aria-label={listening ? "Detener dictado" : "Iniciar dictado"}
          data-listening={listening ? "true" : "false"}
          onClick={listening ? () => stopListening() : startDictation}
          disabled={!supported || state === "estimating"}
        >
          {listening ? "Detener dictado" : "Dictar comida"}
        </button>
        <div className="text-ai-secondary-controls">
          <small className="text-ai-counter">{description.length}/2000</small>
          <button
            type="button"
            className="inventory-text-link"
            onClick={clearDescription}
            disabled={state === "estimating" || !description}
          >
            Borrar texto
          </button>
        </div>
      </div>
      <div className="voice-dictation-details" aria-live="polite" aria-atomic="true">
        {listening ? (
          <div className="voice-recording-indicator" role="status" aria-live="polite" aria-atomic="true">
            <span className="voice-recording-indicator__dot" aria-hidden="true" />
            <span><strong>Escuchando…</strong> Pulsa de nuevo para detener.</span>
          </div>
        ) : null}
        {!supported ? (
          <p className="voice-compatibility">
            El dictado por voz no está disponible en este navegador. Puedes escribir la comida manualmente.
          </p>
        ) : null}
        {voiceError ? <p className="voice-error" role="alert">{voiceError}</p> : null}
        {voiceLimitNotice ? <p className="voice-status">El dictado se ha limitado a 2.000 caracteres.</p> : null}
        {supported ? (
          <p className="voice-privacy">
            El dictado utiliza el servicio de reconocimiento disponible en tu navegador. LaKitchen no guarda el audio.
          </p>
        ) : null}
      </div>
      <p className="muted">Incluye cantidades, unidades y estado del alimento siempre que sea posible.</p>
      <button
        type="button"
        className="button"
        disabled={state === "estimating" || description.trim().length < 3 || description.length > TEXT_AI_DESCRIPTION_MAX_LENGTH}
        onClick={submit}
      >
        {state === "estimating" ? "Calculando estimación…" : "Calcular estimación"}
      </button>
      {state === "needs-clarification" && result?.status === "needs-clarification" ? (
        <p className="auth-message error" role="alert">{result.message}</p>
      ) : null}
      {state === "error" && result?.status === "error" ? (
        <p className="auth-message error" role="alert">{errors[result.code]}</p>
      ) : null}
      {success ? (
        <AiMealEstimationPreview
          result={success}
          mealMode="text-ai"
          warning="Los valores pueden variar según la marca, preparación y tamaño real de las porciones."
          items={items}
          inventoryUnavailable={inventoryUnavailable}
        />
      ) : null}
    </div>
  );
}
