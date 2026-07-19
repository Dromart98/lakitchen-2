import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve(process.cwd(), "app/shopping-list/actions.ts"), "utf8");

describe("voice shopping batch save action contract", () => {
  it("validates then persists through exactly one idempotent RPC", () => {
    const action = actions.slice(
      actions.indexOf("export async function saveVoiceShoppingBatchAction"),
      actions.indexOf("function getOptionalExpirationDate"),
    );
    expect(action).toContain("toVoiceShoppingBatchSaveInput");
    expect(action).toContain("requireAuthenticatedUser");
    expect(action).toContain('rpc("save_voice_shopping_batch"');
    expect(action).toContain("p_submission_id");
    expect(action).toContain("p_items");
    expect(action).toContain("revalidatePath(SHOPPING_LIST_PATH)");
    expect(action).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|generateVoiceShoppingBatch|OPENAI|redirect/);
  });
});
