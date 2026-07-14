export type InventoryNutritionAIResult =
  | {
      ok: true;
      outputText: string;
    }
  | {
      ok: false;
      code: "provider-error" | "invalid-ai-response";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOutputText(root: Record<string, unknown>): string | null {
  if (typeof root.output_text === "string" && root.output_text.trim()) return root.output_text;

  const output = root.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;

    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }

  return null;
}

export function parseInventoryNutritionOpenAIResponse(response: unknown): InventoryNutritionAIResult {
  if (!isRecord(response)) return { ok: false, code: "invalid-ai-response" };

  if (response.error !== null && response.error !== undefined) {
    return { ok: false, code: "provider-error" };
  }

  if (response.status !== "completed") {
    return { ok: false, code: "invalid-ai-response" };
  }

  const outputText = getOutputText(response);
  if (!outputText) return { ok: false, code: "invalid-ai-response" };

  return { ok: true, outputText };
}
