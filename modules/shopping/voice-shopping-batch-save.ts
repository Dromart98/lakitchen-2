import { z } from "zod";

import {
  VOICE_SHOPPING_BATCH_MAX_ITEMS,
  VOICE_SHOPPING_BATCH_UNITS,
  type VoiceShoppingDraftItem,
} from "@/modules/shopping/voice-shopping-batch";

const finiteQuantity = z.number().finite().positive();

export const VoiceShoppingBatchSaveItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: finiteQuantity,
  unit: z.enum(VOICE_SHOPPING_BATCH_UNITS),
}).strict();

export const SaveVoiceShoppingBatchInputSchema = z.object({
  submissionId: z.string().uuid(),
  items: z.array(VoiceShoppingBatchSaveItemSchema).min(1).max(VOICE_SHOPPING_BATCH_MAX_ITEMS),
}).strict();

export type SaveVoiceShoppingBatchInput = z.infer<typeof SaveVoiceShoppingBatchInputSchema>;

export function toVoiceShoppingBatchSaveInput(submissionId: string, items: unknown) {
  return SaveVoiceShoppingBatchInputSchema.safeParse({ submissionId, items });
}

/** Maps editable drafts to the only three columns accepted by the batch RPC. */
export function buildVoiceShoppingBatchSaveItems(items: VoiceShoppingDraftItem[]) {
  return z.array(VoiceShoppingBatchSaveItemSchema).min(1).max(VOICE_SHOPPING_BATCH_MAX_ITEMS).safeParse(
    items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })),
  );
}
