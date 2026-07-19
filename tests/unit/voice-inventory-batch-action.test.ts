import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const actions = readFileSync(resolve(process.cwd(), "app/inventory/actions.ts"), "utf8");
describe("voice inventory batch action contract", () => {
 it("validates, authenticates, and delegates without persistence", () => { const action = actions.slice(actions.indexOf("export async function estimateVoiceInventoryBatchAction")); expect(action).toContain("parseVoiceInventoryBatchInput"); expect(action).toContain("requireAuthenticatedUser"); expect(action).toContain("OPENAI_API_KEY"); expect(action).toContain("OPENAI_VOICE_INVENTORY_BATCH_MODEL"); expect(action).toContain("generateVoiceInventoryBatch"); expect(action).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(|revalidatePath|redirect/); });
});
