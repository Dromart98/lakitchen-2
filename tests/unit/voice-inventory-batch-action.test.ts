import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const actions = readFileSync(resolve(process.cwd(), "app/inventory/actions.ts"), "utf8");
describe("voice inventory batch action contract", () => {
 it("keeps estimation separate from persistence", () => { const action = actions.slice(actions.indexOf("export async function estimateVoiceInventoryBatchAction"), actions.indexOf("export type SaveVoiceInventoryBatchResult")); expect(action).toContain("parseVoiceInventoryBatchInput"); expect(action).toContain("requireAuthenticatedUser"); expect(action).toContain("OPENAI_API_KEY"); expect(action).toContain("OPENAI_VOICE_INVENTORY_BATCH_MODEL"); expect(action).toContain("generateVoiceInventoryBatch"); expect(action).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(|revalidatePath|redirect/); });
 it("saves only via the idempotent RPC", () => { const action = actions.slice(actions.indexOf("export async function saveVoiceInventoryBatchAction")); expect(action).toContain("toVoiceInventoryBatchSaveInput"); expect(action).toContain("requireAuthenticatedUser"); expect(action).toContain('rpc("save_voice_inventory_batch"'); expect(action).toContain("p_submission_id"); expect(action).toContain("p_items"); expect(action).toContain("revalidatePath(INVENTORY_PATH)"); expect(action).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|generateVoiceInventoryBatch|OPENAI/); });
});
