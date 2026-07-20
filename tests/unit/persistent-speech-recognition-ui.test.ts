import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const hook = readFileSync("components/voice/usePersistentSpeechRecognition.ts", "utf8");
const inventory = readFileSync("components/inventory/VoiceInventoryBatchInput.tsx", "utf8");
const shopping = readFileSync("components/shopping/VoiceShoppingBatchInput.tsx", "utf8");

describe("persistent browser speech recognition", () => {
  it("keeps one configured recognition session alive across browser endings", () => {
    expect(hook).toContain("shouldKeepListeningRef");
    expect(hook).toContain("recognitionRef");
    expect(hook).toContain("recognition.continuous = true");
    expect(hook).toContain("recognition.interimResults = false");
    expect(hook).toContain("recognition.maxAlternatives = 1");
    expect(hook).toContain("setTimeout");
    expect(hook).toContain("recognitionRef.current === recognition");
    expect(hook).toContain("isCurrentVoiceSession");
  });

  it("cancels restarts for explicit stops, operations, and unmounts", () => {
    expect(hook).toContain("clearRestartTimer()");
    expect(hook).toContain("recognition.stop()");
    expect(hook).toContain("recognition.abort()");
    expect(inventory).toContain("stopListening();");
    expect(shopping).toContain("stopListening();");
  });

  it("shares the same active-state affordances in both voice inputs", () => {
    for (const input of [inventory, shopping]) {
      expect(input).toContain("Detener dictado");
      expect(input).toContain('data-listening={listening ? "true" : "false"}');
      expect(input).toContain('role="status"');
      expect(input).toContain("Escuchando…");
      expect(input).toContain("usePersistentSpeechRecognition");
    }
  });
});
