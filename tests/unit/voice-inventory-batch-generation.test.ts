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
