"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { estimateVoiceShoppingBatchAction } from "@/app/shopping-list/actions";
import {
  VOICE_SHOPPING_BATCH_MAX_LENGTH,
  type VoiceShoppingDraftItem,
} from "@/modules/shopping/voice-shopping-batch";
import {
  getSpeechRecognitionConstructor,
  getVoiceRecognitionErrorMessage,
  mergeVoiceTranscript,
  type BrowserSpeechRecognition,
  type SpeechRecognitionWindow,
} from "@/modules/voice/browser-speech-recognition";

import { VoiceShoppingBatchPreview } from "./VoiceShoppingBatchPreview";

export function VoiceShoppingBatchInput() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<VoiceShoppingDraftItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();

  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const requestVersion = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    setSupported(
      Boolean(
        getSpeechRecognitionConstructor(
          window as unknown as SpeechRecognitionWindow,
        ),
      ),
    );

    return () => recognition.current?.abort();
  }, []);

  function stop() {
    recognition.current?.stop();
    setListening(false);
  }

  function clear() {
    stop();
    requestVersion.current += 1;
    setText("");
    setItems([]);
    setMessage(null);
  }

  function dictate() {
    const Constructor = getSpeechRecognitionConstructor(
      window as unknown as SpeechRecognitionWindow,
    );

    if (!Constructor || pending) return;

    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = "es-ES";
    instance.continuous = true;
    instance.interimResults = false;
    instance.maxAlternatives = 1;

    instance.onresult = (event) => {
      let spoken = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          spoken += ` ${event.results[index][0].transcript}`;
        }
      }

      if (spoken) {
        setText(
          mergeVoiceTranscript(
            textRef.current,
            spoken,
            VOICE_SHOPPING_BATCH_MAX_LENGTH,
          ),
        );
      }
    };

    instance.onerror = (event) => {
      const error = getVoiceRecognitionErrorMessage(event.error);
      if (error) setMessage(error);
      setListening(false);
    };

    instance.onend = () => setListening(false);

    try {
      instance.start();
      setListening(true);
      setMessage(null);
    } catch {
      setMessage("No se pudo completar el dictado.");
    }
  }

  function analyze() {
    if (pending || !text.trim()) return;

    stop();
    const version = ++requestVersion.current;
    setItems([]);
    setMessage(null);

    startTransition(async () => {
      const result = await estimateVoiceShoppingBatchAction(text);

      if (version !== requestVersion.current) return;

      if (result.status === "error") {
        setMessage(result.message);
        return;
      }

      setItems(result.items);
      setMessage(
        result.status === "needs-clarification" ? result.message : null,
      );
    });
  }

  return (
    <details className="shopping-list-add">
      <summary>Añadir varios por voz</summary>

      <div className="shopping-list-add__heading">
        <h3>Añadir varios por voz</h3>
        <p>Dicta o escribe una lista completa para revisarla antes de añadir nada.</p>
      </div>

      <label className="field" htmlFor="voice-shopping-batch-text">
        <span>Lista de productos</span>
        <textarea
          id="voice-shopping-batch-text"
          maxLength={VOICE_SHOPPING_BATCH_MAX_LENGTH}
          value={text}
          disabled={pending}
          onChange={(event) =>
            setText(
              event.target.value.slice(0, VOICE_SHOPPING_BATCH_MAX_LENGTH),
            )
          }
        />
      </label>

      <div className="shopping-list-add__form">
        <button
          type="button"
          onClick={listening ? stop : dictate}
          disabled={!supported || pending}
          aria-pressed={listening}
        >
          {listening ? "Cancelar dictado" : "Dictar lista"}
        </button>

        <button type="button" onClick={clear}>
          Borrar texto
        </button>

        <button
          type="button"
          onClick={analyze}
          disabled={pending || !text.trim()}
        >
          {pending ? "Analizando productos…" : "Analizar lista"}
        </button>
      </div>

      <div aria-live="polite">
        {!supported ? (
          <p>
            El dictado por voz no está disponible en este navegador. Puedes escribir
            la lista.
          </p>
        ) : (
          <p>{listening ? "Escuchando…" : "Puedes escribir o dictar la lista."}</p>
        )}

        {message ? <p role="alert">{message}</p> : null}
      </div>

      {items.length ? (
        <VoiceShoppingBatchPreview items={items} onChange={setItems} />
      ) : null}
    </details>
  );
}
