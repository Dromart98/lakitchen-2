import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/macros/TextAiMealEstimator.tsx"), "utf8");
const recorder = readFileSync(resolve(process.cwd(), "components/macros/MacroMealRecorder.tsx"), "utf8");

describe("Text AI voice dictation", () => {
  it("reuses the persistent recognition hook without a local browser recognition implementation", () => {
    expect(source).toContain('import { usePersistentSpeechRecognition } from "@/components/voice/usePersistentSpeechRecognition"');
    expect(source).toContain("usePersistentSpeechRecognition({");
    expect(source).not.toContain("getSpeechRecognitionConstructor");
    expect(source).not.toContain("new Constructor()");
  });

  it("offers an accessible toggle and recording status inside the existing Text AI panel", () => {
    expect(source).toContain('aria-pressed={listening}');
    expect(source).toContain('aria-label={listening ? "Detener dictado" : "Dictar comida"}');
    expect(source).toContain('data-listening={listening ? "true" : "false"}');
    expect(source).toContain('>{listening ? "Detener dictado" : "Dictar comida"}</button>');
    expect(source).toContain('className="voice-recording-indicator" role="status" aria-live="polite" aria-atomic="true"');
    expect(source).toContain("Escuchando…");
  });

  it("merges final transcripts into the existing description and stops before incompatible actions", () => {
    expect(source).toContain("mergeVoiceTranscript(descriptionRef.current, transcript)");
    expect(source).toContain("function clear() {\n    stopListening();");
    const submit = source.slice(source.indexOf("async function submit()"), source.indexOf("const success ="));
    expect(submit.indexOf("stopListening();")).toBeLessThan(submit.indexOf("estimateTextMealAction"));
    expect(source).toContain("onSubmitCapture={() => { stopListening(); setSaving(true); }}");
    expect(source).toContain("if (!active) stopListening(true);");
  });

  it("keeps the four existing macro modes and manual entry available", () => {
    expect(recorder).toContain("Solo macros");
    expect(recorder).toContain("Texto IA");
    expect(recorder).toContain("Foto");
    expect(recorder).toContain("Desde inventario");
    expect(recorder).not.toContain("voice-ai");
  });
});
