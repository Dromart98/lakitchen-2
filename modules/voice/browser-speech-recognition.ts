export type SpeechRecognitionAlternative = { transcript: string };
export type SpeechRecognitionResult = { isFinal: boolean; 0: SpeechRecognitionAlternative };
export type SpeechRecognitionResultList = { length: number; [index: number]: SpeechRecognitionResult };
export type SpeechRecognitionResultEvent = { resultIndex: number; results: SpeechRecognitionResultList };
export type SpeechRecognitionErrorEvent = { error: string };

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
export type SpeechRecognitionWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export const TEXT_AI_DESCRIPTION_MAX_LENGTH = 2000;

export function getSpeechRecognitionConstructor(browserWindow?: SpeechRecognitionWindow): SpeechRecognitionConstructor | null {
  return browserWindow?.SpeechRecognition ?? browserWindow?.webkitSpeechRecognition ?? null;
}

export function mergeVoiceTranscript(currentText: string, transcript: string, maxLength = TEXT_AI_DESCRIPTION_MAX_LENGTH): string {
  const current = currentText.trim().replace(/\s+/g, " ");
  const next = transcript.trim().replace(/\s+/g, " ");
  return (next ? (current ? `${current} ${next}` : next) : current).slice(0, maxLength).trimEnd();
}

export function startVoiceSession(currentVersion: number): number {
  return currentVersion + 1;
}

export function isCurrentVoiceSession(currentVersion: number, sessionVersion: number): boolean {
  return currentVersion === sessionVersion;
}

export function getVoiceRecognitionErrorMessage(error: string, wasCancelled = false): string | null {
  if (error === "aborted" && wasCancelled) return null;
  const messages: Record<string, string> = {
    "not-allowed": "No se concedió permiso para usar el micrófono.",
    "service-not-allowed": "No se concedió permiso para usar el micrófono.",
    "audio-capture": "No se encontró un micrófono disponible.",
    "no-speech": "No se detectó voz. Inténtalo de nuevo.",
    network: "El reconocimiento de voz no está disponible ahora.",
    "language-not-supported": "El reconocimiento en español no está disponible en este dispositivo.",
  };
  return messages[error] ?? "No se pudo completar el dictado.";
}
