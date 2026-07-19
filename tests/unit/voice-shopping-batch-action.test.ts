import { describe, expect, it } from "vitest";
import { estimateVoiceShoppingBatchAction } from "@/app/shopping-list/actions";
describe("voice shopping action", () => { it("rejects invalid input before server access", async () => { await expect(estimateVoiceShoppingBatchAction(" ")).resolves.toMatchObject({ status: "error", code: "invalid-input" }); }); });
