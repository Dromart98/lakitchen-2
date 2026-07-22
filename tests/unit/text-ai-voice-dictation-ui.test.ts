import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const estimator = readFileSync("components/macros/TextAiMealEstimator.tsx", "utf8");
const recorder = readFileSync("components/macros/MacroMealRecorder.tsx", "utf8");

describe("Text AI persistent voice dictation", () => {
  it("reuses the shared persistent recognition controller and transcript merger", () => {
    expect(estimator).toContain('usePersistentSpeechRecognition');
    expect(estimator).toContain('mergeVoiceTranscript');
    expect(estimator).toContain('TEXT_AI_DESCRIPTION_MAX_LENGTH');
    expect(estimator).not.toContain('getSpeechRecognitionConstructor');
    expect(estimator).not.toContain('new Constructor');
    expect(estimator).not.toContain('BrowserSpeechRecognition');
    expect(estimator).not.toContain('setTimeout');
  });

  it("exposes the active dictation state accessibly without replacing manual input", () => {
    expect(estimator).toContain('className="text-ai-estimator"');
    expect(estimator).toContain('<textarea');
    expect(estimator).toContain('"Dictar comida"');
    expect(estimator).toContain('"Detener dictado"');
    expect(estimator).toContain('aria-pressed={listening}');
    expect(estimator).toContain('aria-label={listening ? "Detener dictado" : "Iniciar dictado"}');
    expect(estimator).toContain('data-listening={listening ? "true" : "false"}');
    expect(estimator).toContain('className="voice-recording-indicator" role="status"');
    expect(estimator).toContain('aria-live="polite" aria-atomic="true"');
    expect(estimator).toContain('<strong>Escuchando…</strong> Pulsa de nuevo para detener.');
    expect(estimator).toContain('disabled={!supported || state === "estimating"}');
    expect(estimator).toContain('Puedes escribir la comida manualmente.');
    expect(estimator).toContain('className="text-ai-counter">{description.length}/2000');
    expect(estimator).toContain('className="inventory-text-link"');
    expect(estimator).toContain('Borrar texto');
  });

  it("stops recognition before analysis, clearing, descendant form submission and mode changes", () => {
    expect(estimator).toContain('function clearDescription()');
    expect(estimator).toMatch(/function clearDescription\(\) \{\s+stopListening\(\);/);
    expect(estimator).toMatch(/async function submit\(\) \{[\s\S]*?stopListening\(\);[\s\S]*?estimateTextMealAction/);
    expect(estimator).toContain('onSubmitCapture={() => stopListening()}');
    expect(estimator).toMatch(/if \(active\) return;\s+stopListening\(\);/);
  });

  it("keeps the existing four macro modes and the original Text AI processing flow", () => {
    expect(recorder).toContain('initialMode = "manual"');
    expect(recorder).toContain('mode === "text-ai"');
    expect(recorder).toContain('mode === "photo-ai"');
    expect(recorder).toContain('mode === "ingredients"');
    expect(recorder).not.toContain('voice-ai');
    expect(estimator).toContain('estimateTextMealAction({ description })');
    expect(estimator).toContain('<AiMealEstimationPreview');
    expect(estimator).toContain('mealMode="text-ai"');
  });
});
