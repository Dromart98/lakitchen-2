"use server";
import { estimateTextMealWithOpenAi } from "@/lib/openai/text-meal-estimation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { textMealRequestSchema, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";
export async function estimateTextMealAction(input: unknown): Promise<TextMealEstimationResult> { const request = textMealRequestSchema.safeParse(input); if (!request.success) return { status: "error", code: "invalid-input" }; try { const supabase = await createClient(); const user = await getAuthenticatedUser(supabase, "text meal estimation"); if (!user) return { status: "error", code: "unauthenticated" }; const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) return { status: "error", code: "missing-api-key" }; return estimateTextMealWithOpenAi(request.data.description, { apiKey, model: process.env.OPENAI_TEXT_MEAL_MODEL }); } catch { return { status: "error", code: "unexpected-error" }; } }
