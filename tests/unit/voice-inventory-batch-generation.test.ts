import { describe, expect, it } from "vitest";
import { extractVoiceInventoryBatchOutputText } from "@/lib/openai/voice-inventory-batch-generation";

describe("voice inventory Responses extraction", () => {
  it("accepts nested Responses API output_text", () => {
    expect(extractVoiceInventoryBatchOutputText({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{\"items\":[]}" }] }] })).toEqual({ status: "success", text: "{\"items\":[]}" });
  });
  it("rejects refusals and incomplete responses safely", () => {
    expect(extractVoiceInventoryBatchOutputText({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }).status).toBe("invalid-ai-response");
    expect(extractVoiceInventoryBatchOutputText({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }).status).toBe("invalid-ai-response");
  });
});

import { generateVoiceInventoryBatch } from "@/lib/openai/voice-inventory-batch-generation";
import { VOICE_INVENTORY_BATCH_MAX_ITEMS } from "@/modules/inventory/voice-inventory-batch";

const readyItem = {
  name: "Pollo", quantity: 1, unit: "kg", location: "freezer", category: "protein",
  food_state: "raw", nutrition_basis: "per_100g", calories: 120, protein_g: 22,
  carbs_g: 0, fat_g: 3, confidence: "high", issues: [],
};
const completed = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

describe("voice inventory batch provider", () => {
  it("posts a strict, private structured request and accepts root output", async () => {
    let request: RequestInit | undefined;
    const result = await generateVoiceInventoryBatch("un kilo de pollo", {
      apiKey: "test-key", fetchImpl: async (_url, init) => {
        request = init;
        return completed({ status: "completed", output_text: JSON.stringify({ items: [readyItem] }) });
      },
    });
    const body = JSON.parse(String(request?.body));
    expect(result.status).toBe("success");
    expect(request?.method).toBe("POST");
    expect((request?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(body.store).toBe(false);
    expect(body.reasoning.effort).toBe("low");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.properties.items.maxItems).toBe(VOICE_INVENTORY_BATCH_MAX_ITEMS);
  });
  it("maps provider failures and derives missing field issues", async () => {
    const timeout = await generateVoiceInventoryBatch("pollo", { apiKey: "x", fetchImpl: async () => new Response("", { status: 408 }) });
    const rate = await generateVoiceInventoryBatch("pollo", { apiKey: "x", fetchImpl: async () => new Response("", { status: 429 }) });
    const pending = await generateVoiceInventoryBatch("pollo", { apiKey: "x", fetchImpl: async () => completed({ status: "completed", output_text: JSON.stringify({ items: [{ ...readyItem, quantity: null, issues: [] }] }) }) });
    expect(timeout).toMatchObject({ status: "error", code: "timeout" });
    expect(rate).toMatchObject({ status: "error", code: "rate-limited" });
    expect(pending).toMatchObject({ status: "needs-clarification" });
  });
});
