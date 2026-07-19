import { z } from "zod";
import { INVENTORY_CATEGORIES } from "@/modules/inventory/inventory-categories";

const unit = z.enum(["ud", "g", "kg", "ml", "l"]);
const basis = z.enum(["per_100g", "per_100ml", "per_unit"]);
const finite = z.number().finite();
export const VoiceInventoryBatchSaveItemSchema = z.object({
  name: z.string().trim().min(1).max(120), quantity: finite.positive(), unit,
  location: z.enum(["pantry", "fridge", "freezer"]), category: z.enum(INVENTORY_CATEGORIES),
  nutrition_basis: basis, calories: finite.min(0), protein_g: finite.min(0), carbs_g: finite.min(0), fat_g: finite.min(0),
}).strict().superRefine((item, ctx) => {
  const expected = ["g", "kg"].includes(item.unit) ? "per_100g" : ["ml", "l"].includes(item.unit) ? "per_100ml" : "per_unit";
  if (item.nutrition_basis !== expected) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Base nutricional incompatible", path: ["nutrition_basis"] });
});
export const SaveVoiceInventoryBatchInputSchema = z.object({ submissionId: z.string().uuid(), items: z.array(VoiceInventoryBatchSaveItemSchema).min(1).max(30) }).strict();
export type SaveVoiceInventoryBatchInput = z.infer<typeof SaveVoiceInventoryBatchInputSchema>;
export function toVoiceInventoryBatchSaveInput(submissionId: string, items: unknown) { return SaveVoiceInventoryBatchInputSchema.safeParse({ submissionId, items }); }
