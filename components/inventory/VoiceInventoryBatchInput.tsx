"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { estimateVoiceInventoryBatchAction, saveVoiceInventoryBatchAction } from "@/app/inventory/actions";
import { getSpeechRecognitionConstructor, getVoiceRecognitionErrorMessage, mergeVoiceTranscript, type BrowserSpeechRecognition, type SpeechRecognitionWindow } from "@/modules/voice/browser-speech-recognition";
import { VOICE_INVENTORY_BATCH_MAX_LENGTH, type VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";
import { buildVoiceInventoryBatchSaveItems } from "@/modules/inventory/voice-inventory-batch-save";
import { VoiceInventoryBatchPreview } from "./VoiceInventoryBatchPreview";

export function VoiceInventoryBatchInput() {
  const [text, setText] = useState(""); const [items, setItems] = useState<VoiceInventoryDraftItem[]>([]); const [message, setMessage] = useState<string | null>(null); const [submissionId, setSubmissionId] = useState<string | null>(null); const [supported, setSupported] = useState(false); const [listening, setListening] = useState(false); const [isPending, startTransition] = useTransition(); const [saving, setSaving] = useState(false); const recognition = useRef<BrowserSpeechRecognition | null>(null); const requestVersion = useRef(0); const textRef = useRef(text); textRef.current = text;
  useEffect(() => { setSupported(Boolean(getSpeechRecognitionConstructor(window as unknown as SpeechRecognitionWindow))); return () => recognition.current?.abort(); }, []);
  function stop() { recognition.current?.stop(); setListening(false); }
  function clear() { stop(); setText(""); setItems([]); setMessage(null); setSubmissionId(crypto.randomUUID()); requestVersion.current += 1; }
  function dictate() { const Constructor = getSpeechRecognitionConstructor(window as unknown as SpeechRecognitionWindow); if (!Constructor || saving) return; const instance = new Constructor(); recognition.current = instance; instance.lang = "es-ES"; instance.continuous = true; instance.interimResults = false; instance.maxAlternatives = 1; instance.onresult = (event) => { let added = ""; for (let i = event.resultIndex; i < event.results.length; i += 1) if (event.results[i].isFinal) added += ` ${event.results[i][0].transcript}`; if (added) setText(mergeVoiceTranscript(textRef.current, added, VOICE_INVENTORY_BATCH_MAX_LENGTH)); }; instance.onerror = (event) => { const error = getVoiceRecognitionErrorMessage(event.error); if (error) setMessage(error); setListening(false); }; instance.onend = () => setListening(false); try { instance.start(); setMessage(null); setListening(true); } catch { setMessage("No se pudo completar el dictado."); } }
  function analyze() { if (isPending || saving) return; stop(); const version = ++requestVersion.current; setItems([]); setMessage(null); setSubmissionId(null); startTransition(async () => { const result = await estimateVoiceInventoryBatchAction(text); if (version !== requestVersion.current) return; if (result.status === "error") { setMessage(result.message); return; } setItems(result.items); setSubmissionId(crypto.randomUUID()); setMessage(result.status === "needs-clarification" ? result.message : null); }); }
  async function save() {
    if (saving || !submissionId) return;
    const saveItems = buildVoiceInventoryBatchSaveItems(items);
    if (!saveItems.success) { setMessage("Revisa los productos antes de añadirlos al inventario."); return; }
    setSaving(true); setMessage(null);
    try {
      const result = await saveVoiceInventoryBatchAction(submissionId, saveItems.data);
      if (result.status === "error") { setMessage(result.message); return; }
      setItems([]); setText(""); setSubmissionId(crypto.randomUUID()); setMessage(result.message);
    } catch { setMessage("No se pudieron añadir los productos. Inténtalo de nuevo."); }
    finally { setSaving(false); }
  }
  return <section className="inventory-add__body" aria-labelledby="voice-inventory-batch-title"><div className="inventory-add__intro"><h3 id="voice-inventory-batch-title">Añadir por voz</h3><p>Dicta o escribe una compra completa, revisa los productos y añádelos todos de una vez.</p></div><label className="field" htmlFor="voice-inventory-batch-text"><span>Lista de productos</span><textarea id="voice-inventory-batch-text" value={text} onChange={(e) => setText(e.target.value.slice(0, VOICE_INVENTORY_BATCH_MAX_LENGTH))} maxLength={VOICE_INVENTORY_BATCH_MAX_LENGTH} disabled={isPending || saving} placeholder="Dos kilos de pollo al congelador, seis manzanas..." /></label><div className="inventory-filter-form__actions"><button className="inventory-button" type="button" onClick={listening ? stop : dictate} disabled={!supported || isPending || saving} aria-pressed={listening}>{listening ? "Cancelar dictado" : "Dictar lista"}</button><button className="inventory-text-link" type="button" onClick={clear} disabled={isPending || saving}>Borrar texto</button><button className="inventory-button" type="button" onClick={analyze} disabled={isPending || saving || !text.trim()}>{isPending ? "Analizando productos…" : "Analizar lista"}</button></div><div aria-live="polite">{!supported ? <p className="voice-compatibility">El dictado por voz no está disponible en este navegador. Puedes escribir la lista.</p> : <p className="voice-status">{listening ? "Escuchando…" : "Puedes volver a dictar o corregir el texto."}</p>}{message ? <p className="auth-message error" role="alert">{message}</p> : null}</div>{items.length ? <VoiceInventoryBatchPreview items={items} onChange={setItems} submissionId={submissionId} saving={saving} onSave={save} /> : null}</section>;
}
