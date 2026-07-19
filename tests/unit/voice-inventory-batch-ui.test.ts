import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("voice inventory batch UI contracts", () => {
 it("reuses browser dictation and prevents stale previews", () => { const input = source("components/inventory/VoiceInventoryBatchInput.tsx"); expect(input).toContain("getSpeechRecognitionConstructor"); expect(input).toContain("mergeVoiceTranscript"); expect(input).toContain("getVoiceRecognitionErrorMessage"); expect(input).toContain('"es-ES"'); expect(input).toContain("requestVersion"); expect(input).toContain("setItems([])"); expect(input).toContain("maxLength={VOICE_INVENTORY_BATCH_MAX_LENGTH}"); });
 it("keeps preview editable and non-persistent", () => { const preview = source("components/inventory/VoiceInventoryBatchPreview.tsx"); expect(preview).toContain("normalizeEditedVoiceInventoryDraftItem"); expect(preview).toContain("Eliminar"); expect(preview).not.toMatch(/Guardar|insert\(|rpc\(|supabase/i); });
});
