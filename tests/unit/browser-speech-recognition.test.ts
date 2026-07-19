import { describe, expect, it } from "vitest";

import { getSpeechRecognitionConstructor, getVoiceRecognitionErrorMessage, mergeVoiceTranscript, type SpeechRecognitionConstructor } from "@/modules/voice/browser-speech-recognition";

const Constructor = class {} as unknown as SpeechRecognitionConstructor;

describe("browser speech recognition helpers", () => {
  it("merges final transcripts without losing existing text or adding duplicate spaces", () => {
    expect(mergeVoiceTranscript("", "")).toBe("");
    expect(mergeVoiceTranscript("", "  pollo con arroz  ")).toBe("pollo con arroz");
    expect(mergeVoiceTranscript("Ensalada", "  pollo  ")).toBe("Ensalada pollo");
    expect(mergeVoiceTranscript("  Ensalada   verde ", "  pollo   con arroz  ")).toBe("Ensalada verde pollo con arroz");
    expect(mergeVoiceTranscript("Ensalada verde", "   ")).toBe("Ensalada verde");
  });

  it("prefers the standard constructor and falls back to webkit", () => {
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: Constructor, webkitSpeechRecognition: class {} as unknown as SpeechRecognitionConstructor })).toBe(Constructor);
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: Constructor })).toBe(Constructor);
    expect(getSpeechRecognitionConstructor({})).toBeNull();
  });

  it("returns safe Spanish messages for known recognition errors", () => {
    expect(getVoiceRecognitionErrorMessage("not-allowed")).toBe("No se concedió permiso para usar el micrófono.");
    expect(getVoiceRecognitionErrorMessage("audio-capture")).toBe("No se encontró un micrófono disponible.");
    expect(getVoiceRecognitionErrorMessage("no-speech")).toBe("No se detectó voz. Inténtalo de nuevo.");
    expect(getVoiceRecognitionErrorMessage("network")).toBe("El reconocimiento de voz no está disponible ahora.");
    expect(getVoiceRecognitionErrorMessage("language-not-supported")).toBe("El reconocimiento en español no está disponible en este dispositivo.");
    expect(getVoiceRecognitionErrorMessage("aborted", true)).toBeNull();
    expect(getVoiceRecognitionErrorMessage("unknown-code")).toBe("No se pudo completar el dictado.");
  });
});
