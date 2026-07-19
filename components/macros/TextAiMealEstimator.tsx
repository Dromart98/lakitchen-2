"use client";

import { useEffect, useRef, useState } from "react";

import { estimateTextMealAction } from "@/app/macros/actions";
import { AiMealEstimationPreview } from "@/components/macros/AiMealEstimationPreview";
import { getSpeechRecognitionConstructor, getVoiceRecognitionErrorMessage, mergeVoiceTranscript, type BrowserSpeechRecognition, type SpeechRecognitionWindow } from "@/modules/voice/browser-speech-recognition";
import type { TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

type State = "idle" | "estimating" | "success" | "needs-clarification" | "error";
type VoiceState = "unsupported" | "idle" | "listening" | "processing" | "error";
type TextAiMealEstimatorProps = { errorMessage?: string | null; successMessage?: string | null };

const errors: Record<string, string> = { "invalid-input": "Describe la comida con al menos 3 caracteres.", unauthenticated: "Tu sesión ha caducado. Vuelve a iniciar sesión.", "missing-api-key": "La estimación no está disponible ahora.", "provider-timeout": "La estimación tardó demasiado. Inténtalo de nuevo.", "provider-error": "No se pudo calcular la estimación. Inténtalo de nuevo.", "invalid-ai-response": "No se pudo validar la estimación. Reformula la comida e inténtalo de nuevo.", "unexpected-error": "Ocurrió un error inesperado. Inténtalo de nuevo." };

export function TextAiMealEstimator({ errorMessage, successMessage }: TextAiMealEstimatorProps) {
  const [description, setDescription] = useState("");
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<TextMealEstimationResult | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("unsupported");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const descriptionRef = useRef("");
  const cancelled = useRef(false);
  const recognitionFailed = useRef(false);

  useEffect(() => {
    const Constructor = getSpeechRecognitionConstructor(window as unknown as SpeechRecognitionWindow);
    const instance = Constructor ? new Constructor() : null;
    if (instance) {
      instance.lang = "es-ES";
      instance.continuous = false;
      instance.interimResults = true;
      instance.maxAlternatives = 1;
      recognition.current = instance;
      setVoiceState("idle");
    }
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      cancelled.current = true;
      if (instance) {
        instance.onresult = null;
        instance.onerror = null;
        instance.onend = null;
        instance.abort();
      }
      recognition.current = null;
    };
  }, []);

  function change(value: string) {
    requestVersion.current += 1;
    descriptionRef.current = value;
    setDescription(value);
    setResult(null);
    setState("idle");
  }

  function finishVoiceSession() {
    if (!mounted.current) return;
    setInterimTranscript("");
    setVoiceState("idle");
  }

  function startDictation() {
    const instance = recognition.current;
    if (!instance || voiceState === "listening" || voiceState === "processing") return;
    cancelled.current = false;
    recognitionFailed.current = false;
    setVoiceError(null);
    setInterimTranscript("");
    instance.onresult = (event) => {
      if (!mounted.current) return;
      let finalTranscript = "";
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index];
        if (item.isFinal) finalTranscript += item[0].transcript;
        else interim += item[0].transcript;
      }
      setInterimTranscript(interim.trim());
      if (finalTranscript.trim()) change(mergeVoiceTranscript(descriptionRef.current, finalTranscript));
    };
    instance.onerror = (event) => {
      if (!mounted.current) return;
      const message = getVoiceRecognitionErrorMessage(event.error, cancelled.current);
      setInterimTranscript("");
      if (message) { recognitionFailed.current = true; setVoiceError(message); setVoiceState("error"); }
      else finishVoiceSession();
    };
    instance.onend = () => { if (!recognitionFailed.current) finishVoiceSession(); };
    try {
      instance.start();
      setVoiceState("listening");
    } catch {
      recognitionFailed.current = true;
      setVoiceError("No se pudo completar el dictado.");
      setVoiceState("error");
    }
  }

  function stopDictation() {
    if (voiceState !== "listening") return;
    setVoiceState("processing");
    recognition.current?.stop();
  }

  async function submit() {
    if (state === "estimating" || voiceState === "listening" || voiceState === "processing") return;
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
  const isDictating = voiceState === "listening" || voiceState === "processing";
  const voiceAnnouncement = voiceState === "listening" ? "Escuchando…" : voiceState === "processing" ? "Procesando dictado…" : voiceError;

  return <div className="text-ai-estimator">
    {errorMessage ? <p className="auth-message error" role="alert">{errorMessage}</p> : null}
    {successMessage ? <p className="auth-message success" role="status">{successMessage}</p> : null}
    <label className="field" htmlFor="text-ai-description"><span>Describe lo que has comido</span>
      <div className="text-ai-description-row"><textarea id="text-ai-description" value={description} onChange={(event) => change(event.target.value)} onBlur={() => { if (voiceState === "listening") stopDictation(); }} disabled={state === "estimating"} minLength={3} maxLength={2000} placeholder="240 g de pollo, 150 g de arroz cocido y una cucharadita de aceite" />
        {voiceState !== "unsupported" ? <button type="button" className={`voice-dictation-button${isDictating ? " is-listening" : ""}`} aria-pressed={isDictating} aria-label={isDictating ? "Detener dictado" : "Dictar comida"} onClick={isDictating ? stopDictation : startDictation} disabled={state === "estimating"}>{isDictating ? "Detener dictado" : "Dictar comida"}</button> : null}
      </div>
      <small className="text-ai-counter">{description.length}/2000</small>
    </label>
    <div className="voice-dictation-details" aria-live="polite" aria-atomic="true">
      {voiceState === "unsupported" ? <p className="voice-compatibility">El dictado por voz no está disponible en este navegador.</p> : null}
      {voiceAnnouncement ? <p className={voiceError ? "voice-error" : "voice-status"}>{voiceAnnouncement}</p> : null}
      {interimTranscript ? <p className="voice-interim">Reconociendo: {interimTranscript}</p> : null}
      {voiceState !== "unsupported" ? <p className="voice-privacy">El dictado utiliza el servicio de reconocimiento disponible en tu navegador. LaKitchen no guarda el audio.</p> : null}
    </div>
    <p className="muted">Incluye cantidades, unidades y estado del alimento siempre que sea posible.</p>
    <button type="button" className="button" disabled={state === "estimating" || isDictating || description.trim().length < 3} onClick={submit}>{state === "estimating" ? "Calculando estimación…" : "Calcular estimación"}</button>
    {state === "needs-clarification" && result?.status === "needs-clarification" ? <p className="auth-message error" role="alert">{result.message}</p> : null}
    {state === "error" && result?.status === "error" ? <p className="auth-message error" role="alert">{errors[result.code]}</p> : null}
    {success ? <AiMealEstimationPreview result={success} mealMode="text-ai" warning="Los valores pueden variar según la marca, preparación y tamaño real de las porciones." /> : null}
  </div>;
}
