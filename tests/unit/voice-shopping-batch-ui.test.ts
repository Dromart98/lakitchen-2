import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const inputSource = readFileSync(
  "components/shopping/VoiceShoppingBatchInput.tsx",
  "utf8",
);
const previewSource = readFileSync(
  "components/shopping/VoiceShoppingBatchPreview.tsx",
  "utf8",
);

describe("voice shopping UI boundaries", () => {
  it("keeps browser speech and preview-only controls", () => {
    expect(inputSource).toContain("usePersistentSpeechRecognition");
    expect(inputSource).toContain("mergeVoiceTranscript");
    expect(inputSource).not.toContain("createClient");
    expect(previewSource).not.toContain("Guardar");
  });

  it("invalidates pending analysis when the text is cleared", () => {
    expect(inputSource).toContain("disabled={pending || saving}");
    expect(inputSource).toContain('requestVersion.current += 1;');
    expect(inputSource).toContain('setText("");');
    expect(inputSource).toContain("setItems([]);");
    expect(inputSource).toContain("setMessage(null);");
    expect(inputSource).toContain("if (version !== requestVersion.current) return;");

    const clearButton = inputSource.match(
      /<button type="button" onClick=\{clear\} disabled=\{saving\}>\s*Borrar texto\s*<\/button>/,
    );
    expect(clearButton).not.toBeNull();
  });

  it("keeps dictation and analysis blocked while a request is pending", () => {
    expect(inputSource).toContain("disabled={!supported || pending || saving}");
    expect(inputSource).toContain("disabled={pending || saving || !text.trim()}");
    expect(inputSource).toContain("if (pending || saving) return;");
    expect(inputSource).toContain("if (pending || saving || !text.trim()) return;");
  });
});
