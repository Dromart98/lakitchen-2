"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSpeechRecognitionConstructor,
  getVoiceRecognitionErrorMessage,
  isCurrentVoiceSession,
  startVoiceSession,
  type BrowserSpeechRecognition,
  type SpeechRecognitionWindow,
} from "@/modules/voice/browser-speech-recognition";

const RESTART_DELAY_MS = 250;

type PersistentSpeechRecognitionOptions = {
  onFinalTranscript: (transcript: string) => void;
  onError: (message: string) => void;
};

export function usePersistentSpeechRecognition({
  onFinalTranscript,
  onError,
}: PersistentSpeechRecognitionOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const mountedRef = useRef(false);
  const shouldKeepListeningRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const sessionVersionRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);
  onFinalTranscriptRef.current = onFinalTranscript;
  onErrorRef.current = onError;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback((abort = false) => {
    shouldKeepListeningRef.current = false;
    sessionVersionRef.current = startVoiceSession(sessionVersionRef.current);
    clearRestartTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      if (abort) recognition.abort();
      else recognition.stop();
    }
    if (mountedRef.current) setListening(false);
  }, [clearRestartTimer]);

  const startListening = useCallback(() => {
    const Constructor = getSpeechRecognitionConstructor(
      window as unknown as SpeechRecognitionWindow,
    );
    if (!Constructor || !mountedRef.current) return;

    shouldKeepListeningRef.current = true;
    sessionVersionRef.current = startVoiceSession(sessionVersionRef.current);
    clearRestartTimer();

    const startSession = () => {
      if (!mountedRef.current || !shouldKeepListeningRef.current || recognitionRef.current) return;
      const sessionVersion = sessionVersionRef.current;
      const recognition = new Constructor();
      recognitionRef.current = recognition;
      recognition.lang = "es-ES";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        if (!mountedRef.current || !isCurrentVoiceSession(sessionVersionRef.current, sessionVersion)) return;
        let transcript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) transcript += ` ${event.results[index][0].transcript}`;
        }
        if (transcript) onFinalTranscriptRef.current(transcript);
      };

      recognition.onerror = (event) => {
        if (!mountedRef.current || !isCurrentVoiceSession(sessionVersionRef.current, sessionVersion)) return;
        if (event.error === "no-speech" || event.error === "aborted") return;
        const message = getVoiceRecognitionErrorMessage(event.error);
        stopListening();
        if (message) onErrorRef.current(message);
      };

      recognition.onend = () => {
        if (!mountedRef.current || !shouldKeepListeningRef.current || !isCurrentVoiceSession(sessionVersionRef.current, sessionVersion)) return;
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (restartTimerRef.current !== null) return;
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          startSession();
        }, RESTART_DELAY_MS);
      };

      try {
        recognition.start();
        if (mountedRef.current) setListening(true);
      } catch {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        stopListening();
        onErrorRef.current("No se pudo completar el dictado.");
      }
    };

    startSession();
  }, [clearRestartTimer, stopListening]);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(Boolean(getSpeechRecognitionConstructor(window as unknown as SpeechRecognitionWindow)));
    return () => {
      mountedRef.current = false;
      stopListening(true);
    };
  }, [stopListening]);

  return { listening, supported, startListening, stopListening };
}
