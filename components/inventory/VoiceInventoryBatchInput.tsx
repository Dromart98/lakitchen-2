"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { estimateVoiceInventoryBatchAction, saveVoiceInventoryBatchAction } from "@/app/inventory/actions";
import { usePersistentSpeechRecognition } from "@/components/voice/usePersistentSpeechRecognition";
import { VOICE_INVENTORY_BATCH_MAX_LENGTH, type VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";
import { buildVoiceInventoryBatchCatalogMetadata, buildVoiceInventoryBatchSaveItems } from "@/modules/inventory/voice-inventory-batch-save";
import { mergeVoiceTranscript } from "@/modules/voice/browser-speech-recognition";

import { VoiceInventoryBatchPreview } from "./VoiceInventoryBatchPreview";

export function VoiceInventoryBatchInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [items, setItems] = useState<VoiceInventoryDraftItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const requestVersion = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;
  const { listening, supported, startListening, stopListening } = usePersistentSpeechRecognition({
    onFinalTranscript: (transcript) => setText(mergeVoiceTranscript(textRef.current, transcript, VOICE_INVENTORY_BATCH_MAX_LENGTH)),
    onError: setMessage,
  });

  function dictate() {
    if (isPending || saving) return;
    setMessage(null);
    startListening();
  }

  function clear() {
    stopListening();
    setText("");
    setItems([]);
    setMessage(null);
    setSubmissionId(crypto.randomUUID());
    requestVersion.current += 1;
  }

  function analyze() {
    if (isPending || saving || !text.trim()) return;
    stopListening();
    const version = ++requestVersion.current;
    setItems([]);
    setMessage(null);
    setSubmissionId(null);
    startTransition(async () => {
      const result = await estimateVoiceInventoryBatchAction(text);
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
    const saveItems = buildVoiceInventoryBatchSaveItems(items);
    const catalogMetadata = buildVoiceInventoryBatchCatalogMetadata(items);
    if (!saveItems.success || !catalogMetadata.success) {
      setMessage("Revisa los productos antes de añadirlos al inventario.");
      return;
    }
    stopListening();
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveVoiceInventoryBatchAction(submissionId, saveItems.data, catalogMetadata.data);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setItems([]);
      setText("");
      setSubmissionId(crypto.randomUUID());
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage("No se pudieron añadir los productos. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="inventory-add__body" aria-labelledby="voice-inventory-batch-title"><div className="inventory-add__intro"><h3 id="voice-inventory-batch-title">Añadir por voz</h3><p>Dicta o escribe una compra completa, revisa los productos y añádelos todos de una vez.</p></div><label className="field" htmlFor="voice-inventory-batch-text"><span>Lista de productos</span><textarea id="voice-inventory-batch-text" value={text} onChange={(event) => setText(event.target.value.slice(0, VOICE_INVENTORY_BATCH_MAX_LENGTH))} maxLength={VOICE_INVENTORY_BATCH_MAX_LENGTH} disabled={isPending || saving} placeholder="Dos kilos de pollo al congelador, seis manzanas..." /></label><div className="inventory-filter-form__actions"><button className="inventory-button" type="button" onClick={listening ? () => stopListening() : dictate} disabled={!supported || isPending || saving} aria-pressed={listening} aria-label={listening ? "Detener dictado" : "Iniciar dictado"} data-listening={listening ? "true" : "false"}>{listening ? "Detener dictado" : "Dictar lista"}</button><button className="inventory-text-link" type="button" onClick={clear} disabled={isPending || saving}>Borrar texto</button><button className="inventory-button" type="button" onClick={analyze} disabled={isPending || saving || !text.trim()}>{isPending ? "Analizando productos…" : "Analizar lista"}</button></div><div aria-live="polite">{listening ? <div className="voice-recording-indicator" role="status" aria-live="polite" aria-atomic="true"><span className="voice-recording-indicator__dot" aria-hidden="true" /><span><strong>Escuchando…</strong> Pulsa de nuevo para detener.</span></div> : null}{!supported ? <p className="voice-compatibility">El dictado por voz no está disponible en este navegador. Puedes escribir la lista.</p> : !listening ? <p className="voice-status">Puedes volver a dictar o corregir el texto.</p> : null}{message ? <p className="auth-message error" role="alert">{message}</p> : null}</div>{items.length ? <VoiceInventoryBatchPreview items={items} onChange={setItems} submissionId={submissionId} saving={saving} onSave={save} /> : null}</section>;
}
