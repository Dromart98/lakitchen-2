"use client";

import { useRef, useState, useTransition } from "react";

import { estimateVoiceShoppingBatchAction, saveVoiceShoppingBatchAction } from "@/app/shopping-list/actions";
import { usePersistentSpeechRecognition } from "@/components/voice/usePersistentSpeechRecognition";
import { VOICE_SHOPPING_BATCH_MAX_LENGTH, type VoiceShoppingDraftItem } from "@/modules/shopping/voice-shopping-batch";
import { buildVoiceShoppingBatchSaveItems } from "@/modules/shopping/voice-shopping-batch-save";
import { mergeVoiceTranscript } from "@/modules/voice/browser-speech-recognition";

import { VoiceShoppingBatchPreview } from "./VoiceShoppingBatchPreview";

export function VoiceShoppingBatchInput() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<VoiceShoppingDraftItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const requestVersion = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;
  const { listening, supported, startListening, stopListening } = usePersistentSpeechRecognition({
    onFinalTranscript: (transcript) => setText(mergeVoiceTranscript(textRef.current, transcript, VOICE_SHOPPING_BATCH_MAX_LENGTH)),
    onError: setMessage,
  });

  function dictate() {
    if (pending || saving) return;
    setMessage(null);
    startListening();
  }

  function clear() {
    stopListening();
    requestVersion.current += 1;
    setText("");
    setItems([]);
    setMessage(null);
    setSubmissionId(crypto.randomUUID());
  }

  function analyze() {
    if (pending || saving || !text.trim()) return;
    stopListening();
    const version = ++requestVersion.current;
    setItems([]);
    setMessage(null);
    setSubmissionId(null);
    startTransition(async () => {
      const result = await estimateVoiceShoppingBatchAction(text);
      if (version !== requestVersion.current) return;
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setItems(result.items);
      setSubmissionId(crypto.randomUUID());
      setMessage(result.status === "needs-clarification" ? result.message : null);
    });
  }

  async function save() {
    if (saving || !submissionId) return;
    const saveItems = buildVoiceShoppingBatchSaveItems(items);
    if (!saveItems.success) {
      setMessage("Revisa los productos antes de añadirlos a la lista de compra.");
      return;
    }
    stopListening();
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveVoiceShoppingBatchAction(submissionId, saveItems.data);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setItems([]);
      setText("");
      setSubmissionId(crypto.randomUUID());
      setMessage(result.message);
    } catch {
      setMessage("No se pudieron añadir los productos. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="shopping-list-add"><summary>Añadir por voz</summary><div className="shopping-list-add__heading"><h3>Añadir por voz</h3><p>Dicta o escribe una lista completa para revisarla antes de añadir nada.</p></div><label className="field" htmlFor="voice-shopping-batch-text"><span>Lista de productos</span><textarea id="voice-shopping-batch-text" maxLength={VOICE_SHOPPING_BATCH_MAX_LENGTH} value={text} disabled={pending || saving} onChange={(event) => setText(event.target.value.slice(0, VOICE_SHOPPING_BATCH_MAX_LENGTH))} /></label><div className="shopping-list-add__form"><button type="button" onClick={listening ? () => stopListening() : dictate} disabled={!supported || pending || saving} aria-pressed={listening} aria-label={listening ? "Detener dictado" : "Iniciar dictado"} data-listening={listening ? "true" : "false"}>{listening ? "Detener dictado" : "Dictar lista"}</button><button type="button" onClick={clear} disabled={saving}>Borrar texto</button><button type="button" onClick={analyze} disabled={pending || saving || !text.trim()}>{pending ? "Analizando productos…" : "Analizar lista"}</button></div><div aria-live="polite">{listening ? <div className="voice-recording-indicator" role="status" aria-live="polite" aria-atomic="true"><span className="voice-recording-indicator__dot" aria-hidden="true" /><span><strong>Escuchando…</strong> Pulsa de nuevo para detener.</span></div> : null}{!supported ? <p>El dictado por voz no está disponible en este navegador. Puedes escribir la lista.</p> : !listening ? <p>Puedes escribir o dictar la lista.</p> : null}{message ? <p role="alert">{message}</p> : null}</div>{items.length ? <VoiceShoppingBatchPreview items={items} onChange={setItems} submissionId={submissionId} saving={saving} onSave={save} /> : null}</details>;
}
