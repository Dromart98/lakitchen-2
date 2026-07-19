"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMealType } from "@/modules/meals/meal-types";
import { parseMealBuilderConsumptionLines } from "@/modules/meals/meal-builder";
import { estimateTextMealWithOpenAi } from "@/lib/openai/text-meal-estimation";
import { estimatePhotoMealWithOpenAi } from "@/lib/openai/photo-meal-estimation";
import { photoMealContextSchema, validatePhotoMealFile } from "@/modules/meals/photo-meal-ai";
import { getAuthenticatedUser, requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { textMealRequestSchema, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";
export async function estimateTextMealAction(input: unknown): Promise<TextMealEstimationResult> { const request = textMealRequestSchema.safeParse(input); if (!request.success) return { status: "error", code: "invalid-input" }; try { const supabase = await createClient(); const user = await getAuthenticatedUser(supabase, "text meal estimation"); if (!user) return { status: "error", code: "unauthenticated" }; const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) return { status: "error", code: "missing-api-key" }; return estimateTextMealWithOpenAi(request.data.description, { apiKey, model: process.env.OPENAI_TEXT_MEAL_MODEL }); } catch { return { status: "error", code: "unexpected-error" }; } }

export async function estimatePhotoMealAction(formData: FormData): Promise<TextMealEstimationResult> {
  const context = photoMealContextSchema.safeParse({ context: formData.get("context") ?? "" });
  if (!context.success) return { status: "error", code: "invalid-input" };
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "photo meal estimation");
    if (!user) return { status: "error", code: "unauthenticated" };
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { status: "error", code: "missing-api-key" };
    const validated = await validatePhotoMealFile(formData.get("photo"));
    if (!validated.ok) return { status: "error", code: validated.code };
    const bytes = new Uint8Array(await validated.file.arrayBuffer());
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
    return estimatePhotoMealWithOpenAi(imageDataUrl, context.data.context, { apiKey, model: process.env.OPENAI_PHOTO_MEAL_MODEL });
  } catch { return { status: "error", code: "unexpected-error" }; }
}


function isAiMealMode(value: unknown): value is "text-ai" | "photo-ai" {
  return value === "text-ai" || value === "photo-ai";
}

function aiDestination(mode: "text-ai" | "photo-ai", kind: "mealError" | "mealSuccess", code: string) {
  return `/macros?mealMode=${mode}&${kind}=${encodeURIComponent(code)}#registrar-comida`;
}
function aiConsumptionError(error: { code?: string; message: string }) {
  if (error.code === "P0002" || error.message === "Inventory item not found") return "product-not-found";
  if (error.code === "23505" || error.message === "Duplicate meal builder item") return "duplicate-product";
  if (error.code === "22003" || error.message === "Quantity exceeds available stock") return "quantity-too-high";
  if (error.message === "Incomplete inventory nutrition") return "incomplete-nutrition";
  if (error.message === "Incompatible inventory nutrition unit") return "incompatible-unit";
  return "consume-failed";
}
export async function consumeAiMealInventoryAction(formData: FormData) {
  const rawMode = formData.get("meal_mode");
  if (!isAiMealMode(rawMode)) redirect("/macros?mealError=invalid-meal-mode#registrar-comida");
  const mode = rawMode;
  const name = String(formData.get("meal_name") ?? "").trim(); const type = String(formData.get("meal_type") ?? "").trim();
  if (!name || name.length > 120) redirect(aiDestination(mode, "mealError", "invalid-name"));
  if (!isMealType(type)) redirect(aiDestination(mode, "mealError", "invalid-meal-type"));
  const parsed = parseMealBuilderConsumptionLines(formData.get("lines"));
  if ("error" in parsed) redirect(aiDestination(mode, "mealError", parsed.error));
  const supabase = await createClient(); await requireAuthenticatedUser(supabase, "AI meal inventory consumption");
  const { error } = await (supabase as any).rpc("consume_meal_builder_items_and_log_meal", { p_meal_name: name, p_meal_type: type, p_lines: parsed.lines });
  if (error) redirect(aiDestination(mode, "mealError", aiConsumptionError(error)));
  ["/macros", "/inventory", "/dashboard", "/meal-history", "/weekly-summary"].forEach((path) => revalidatePath(path));
  redirect(aiDestination(mode, "mealSuccess", "meal-consumed-logged"));
}
