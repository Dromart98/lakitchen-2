import { describe, expect, it } from "vitest";

import { getSpeechRecognitionConstructor, getVoiceRecognitionErrorMessage, isCurrentVoiceSession, mergeVoiceTranscript, startVoiceSession, TEXT_AI_DESCRIPTION_MAX_LENGTH, type SpeechRecognitionConstructor } from "@/modules/voice/browser-speech-recognition";

const Constructor = class {} as unknown as SpeechRecognitionConstructor;

describe("browser speech recognition helpers", () => {
  it("merges final transcripts without losing existing text or adding duplicate spaces", () => {
    expect(mergeVoiceTranscript("", "")).toBe("");
    expect(mergeVoiceTranscript("", "  pollo con arroz  ")).toBe("pollo con arroz");
    expect(mergeVoiceTranscript("Ensalada", "  pollo  ")).toBe("Ensalada pollo");
    expect(mergeVoiceTranscript("  Ensalada   verde ", "  pollo   con arroz  ")).toBe("Ensalada verde pollo con arroz");
    expect(mergeVoiceTranscript("Ensalada verde", "   ")).toBe("Ensalada verde");
  });

  it("limits voice transcripts to the shared description maximum", () => {
    expect(mergeVoiceTranscript("a".repeat(1990), " una transcripción muy larga")).toHaveLength(TEXT_AI_DESCRIPTION_MAX_LENGTH);
    expect(mergeVoiceTranscript("a".repeat(TEXT_AI_DESCRIPTION_MAX_LENGTH), " más texto")).toBe("a".repeat(TEXT_AI_DESCRIPTION_MAX_LENGTH));
    expect(mergeVoiceTranscript("a".repeat(TEXT_AI_DESCRIPTION_MAX_LENGTH + 10), "")).toBe("a".repeat(TEXT_AI_DESCRIPTION_MAX_LENGTH));
    expect(mergeVoiceTranscript("  hola   mundo  ", "  otra   frase  ", 12)).toBe("hola mundo o");
    const truncated = mergeVoiceTranscript("a".repeat(1990), ` ${"b".repeat(100)}`);
    expect(truncated.length).toBeLessThanOrEqual(TEXT_AI_DESCRIPTION_MAX_LENGTH);
    expect(truncated.endsWith(" ")).toBe(false);
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
    expect(getVoiceRecognitionErrorMessage("aborted")).toBe("No se pudo completar el dictado.");
    expect(getVoiceRecognitionErrorMessage("unknown-code")).toBe("No se pudo completar el dictado.");
  });

  it("invalidates obsolete voice sessions after cancellation or a new start", () => {
    const firstSession = startVoiceSession(0);
    expect(isCurrentVoiceSession(firstSession, firstSession)).toBe(true);
    const cancelledVersion = startVoiceSession(firstSession);
    expect(isCurrentVoiceSession(cancelledVersion, firstSession)).toBe(false);
    const newSession = startVoiceSession(cancelledVersion);
    expect(isCurrentVoiceSession(newSession, cancelledVersion)).toBe(false);
    expect(isCurrentVoiceSession(newSession, newSession)).toBe(true);
  });
});
