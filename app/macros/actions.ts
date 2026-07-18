"use server";
import { estimateTextMealWithOpenAi } from "@/lib/openai/text-meal-estimation";
import { estimatePhotoMealWithOpenAi } from "@/lib/openai/photo-meal-estimation";
import { photoMealContextSchema, validatePhotoMealFile } from "@/modules/meals/photo-meal-ai";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { textMealRequestSchema, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";
export async function estimateTextMealAction(input: unknown): Promise<TextMealEstimationResult> { const request = textMealRequestSchema.safeParse(input); if (!request.success) return { status: "error", code: "invalid-input" }; try { const supabase = await createClient(); const user = await getAuthenticatedUser(supabase, "text meal estimation"); if (!user) return { status: "error", code: "unauthenticated" }; const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) return { status: "error", code: "missing-api-key" }; return estimateTextMealWithOpenAi(request.data.description, { apiKey, model: process.env.OPENAI_TEXT_MEAL_MODEL }); } catch { return { status: "error", code: "unexpected-error" }; } }

export async function estimatePhotoMealAction(formData: FormData): Promise<TextMealEstimationResult> {
  const context = photoMealContextSchema.safeParse({ context: formData.get("context") ?? "" });
  if (!context.success) return { status: "error", code: "invalid-input" };
  const validated = await validatePhotoMealFile(formData.get("photo"));
  if (!validated.ok) return { status: "error", code: validated.code };
  try {
    const supabase = await createClient(); const user = await getAuthenticatedUser(supabase, "photo meal estimation");
    if (!user) return { status: "error", code: "unauthenticated" };
    const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) return { status: "error", code: "missing-api-key" };
    const bytes = new Uint8Array(await validated.file.arrayBuffer());
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
    return estimatePhotoMealWithOpenAi(imageDataUrl, context.data.context, { apiKey, model: process.env.OPENAI_PHOTO_MEAL_MODEL });
  } catch { return { status: "error", code: "unexpected-error" }; }
}
