"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMealType } from "@/modules/meals/meal-types";
import { parseMealBuilderConsumptionLines } from "@/modules/meals/meal-builder";
import { estimateTextMealWithOpenAi, TEXT_MEAL_AI_MODEL_DEFAULT, TEXT_MEAL_PROVIDER_CONTRACT } from "@/lib/openai/text-meal-estimation";
import { estimatePhotoMealWithOpenAi, PHOTO_MEAL_AI_MODEL_DEFAULT, PHOTO_MEAL_PROVIDER_CONTRACT } from "@/lib/openai/photo-meal-estimation";
import { photoMealContextSchema, validatePhotoMealFile } from "@/modules/meals/photo-meal-ai";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { textMealRequestSchema, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";
import { isValidUuid } from "@/modules/meals/meal-validation";
import { createTextMealCacheKey, purgeExpiredTextMealCache, readTextMealCache, writeTextMealCache, type TextMealCacheClient } from "@/modules/meals/text-meal-cache";
import { createPhotoMealCacheKey, purgeExpiredPhotoMealCache, readPhotoMealCache, writePhotoMealCache, type PhotoMealCacheClient } from "@/modules/meals/photo-meal-cache";
import { classifyAiResult, createAiUsageMeter } from "@/lib/ai/metering";

type AiMealInventoryRpcClient = {
  rpc: (functionName: "consume_ai_meal_inventory_and_log_meal", args: {
    p_submission_id: string;
    p_meal_name: string;
    p_meal_type: string;
    p_lines: { item_id: string; consumed_quantity: number }[];
  }) => Promise<{ error: { code?: string; message: string } | null }>;
};
export async function estimateTextMealAction(input: unknown): Promise<TextMealEstimationResult> {
  const request = textMealRequestSchema.safeParse(input);
  if (!request.success) return { status: "error", code: "invalid-input" };
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "text meal estimation");
    if (!user) return { status: "error", code: "unauthenticated" };
    const model = process.env.OPENAI_TEXT_MEAL_MODEL ?? TEXT_MEAL_AI_MODEL_DEFAULT;
    const meter = createAiUsageMeter({ userId: user.id, feature: "text_meal", model });
    if (!meter.authorizeFeature()) {
      await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
      return { status: "error", code: "ai-feature-disabled" };
    }
    const cacheKey = createTextMealCacheKey(request.data.description, model, TEXT_MEAL_PROVIDER_CONTRACT);
    // The service-role client is created only after the browser session has
    // been authenticated; the cache owner always comes from that session.
    let cacheClient: TextMealCacheClient | null = null;
    try {
      cacheClient = createAdminClient() as unknown as TextMealCacheClient;
    } catch {
      // Cache configuration must never make Text AI unavailable.
    }
    if (cacheClient) await purgeExpiredTextMealCache(cacheClient).catch(() => undefined);
    const cached = cacheClient
      ? await readTextMealCache(cacheClient, user.id, cacheKey).catch(() => null)
      : null;
    if (cached) {
      await meter.finish({ outcome: "success", cacheHit: true });
      return cached;
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await meter.finish({ outcome: "error", errorCode: "not-configured" });
      return { status: "error", code: "missing-api-key" };
    }
    const result = await estimateTextMealWithOpenAi(request.data.description, { apiKey, model, fetchImpl: meter.fetchImpl });
    if (result.status === "success" && cacheClient) {
      await writeTextMealCache(cacheClient, user.id, cacheKey, model, TEXT_MEAL_PROVIDER_CONTRACT, result).catch(() => undefined);
    }
    await meter.finish(classifyAiResult(result));
    const accessError = meter.getAccessError();
    if (accessError) return { status: "error", code: accessError };
    return result;
  } catch { return { status: "error", code: "unexpected-error" }; }
}

export async function estimatePhotoMealAction(formData: FormData): Promise<TextMealEstimationResult> {
  const context = photoMealContextSchema.safeParse({ context: formData.get("context") ?? "" });
  if (!context.success) return { status: "error", code: "invalid-input" };
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "photo meal estimation");
    if (!user) return { status: "error", code: "unauthenticated" };
    const validated = await validatePhotoMealFile(formData.get("photo"));
    if (!validated.ok) return { status: "error", code: validated.code };
    const bytes = new Uint8Array(await validated.file.arrayBuffer());
    const model = process.env.OPENAI_PHOTO_MEAL_MODEL ?? PHOTO_MEAL_AI_MODEL_DEFAULT;
    const meter = createAiUsageMeter({ userId: user.id, feature: "photo_meal", model });
    if (!meter.authorizeFeature()) {
      await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
      return { status: "error", code: "ai-feature-disabled" };
    }
    const cacheKey = createPhotoMealCacheKey(bytes, context.data.context, model, PHOTO_MEAL_PROVIDER_CONTRACT);
    let cacheClient: PhotoMealCacheClient | null = null;
    try {
      cacheClient = createAdminClient() as unknown as PhotoMealCacheClient;
    } catch {
      // Cache configuration must never make Photo AI unavailable.
    }
    if (cacheClient) await purgeExpiredPhotoMealCache(cacheClient).catch(() => undefined);
    const cached = cacheClient
      ? await readPhotoMealCache(cacheClient, user.id, cacheKey).catch(() => null)
      : null;
    if (cached) {
      await meter.finish({ outcome: "success", cacheHit: true });
      return cached;
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await meter.finish({ outcome: "error", errorCode: "not-configured" });
      return { status: "error", code: "missing-api-key" };
    }
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
    const result = await estimatePhotoMealWithOpenAi(imageDataUrl, context.data.context, { apiKey, model, fetchImpl: meter.fetchImpl });
    if (result.status === "success" && cacheClient) {
      await writePhotoMealCache(cacheClient, user.id, cacheKey, model, PHOTO_MEAL_PROVIDER_CONTRACT, result).catch(() => undefined);
    }
    await meter.finish(classifyAiResult(result));
    const accessError = meter.getAccessError();
    if (accessError) return { status: "error", code: accessError };
    return result;
  } catch { return { status: "error", code: "unexpected-error" }; }
}


function isAiMealMode(value: unknown): value is "text-ai" | "photo-ai" {
  return value === "text-ai" || value === "photo-ai";
}

function aiDestination(mode: "text-ai" | "photo-ai", kind: "mealError" | "mealSuccess", code: string) {
  return `/macros?mealMode=${mode}&${kind}=${encodeURIComponent(code)}#registrar-comida`;
}
function aiConsumptionError(error: { code?: string; message: string }) {
  if (error.code === "28000" || error.message === "not-authenticated") return "unauthenticated";
  if (error.code === "P0002" || error.message === "product-not-found") return "product-not-found";
  if (error.code === "42501" || error.message === "product-not-owned") return "product-not-owned";
  if (error.code === "23505" || error.message === "duplicate-product") return "duplicate-product";
  if (error.code === "22003" || error.message === "quantity-insufficient") return "quantity-too-high";
  if (error.message === "incompatible-unit") return "incompatible-unit";
  if (error.message === "submission-conflict") return "submission-conflict";
  if (error.code === "22023" || error.message === "invalid-payload") return "invalid-payload";
  return "consume-failed";
}
export async function consumeAiMealInventoryAction(formData: FormData) {
  const rawMode = formData.get("meal_mode");
  if (!isAiMealMode(rawMode)) redirect("/macros?mealError=invalid-meal-mode#registrar-comida");
  const mode = rawMode;
  const name = String(formData.get("meal_name") ?? "").trim(); const type = String(formData.get("meal_type") ?? "").trim();
  if (!name || name.length > 120) redirect(aiDestination(mode, "mealError", "invalid-name"));
  if (!isMealType(type)) redirect(aiDestination(mode, "mealError", "invalid-meal-type"));
  const submissionId = formData.get("submission_id");
  if (!isValidUuid(submissionId)) redirect(aiDestination(mode, "mealError", "invalid-payload"));
  const parsed = parseMealBuilderConsumptionLines(formData.get("lines"));
  if ("error" in parsed) redirect(aiDestination(mode, "mealError", parsed.error));
  const supabase = await createClient();
  if (!await getAuthenticatedUser(supabase, "AI meal inventory consumption")) redirect(aiDestination(mode, "mealError", "unauthenticated"));
  const aiMealClient = supabase as unknown as AiMealInventoryRpcClient;
  const { error } = await aiMealClient.rpc("consume_ai_meal_inventory_and_log_meal", { p_submission_id: submissionId, p_meal_name: name, p_meal_type: type, p_lines: parsed.lines });
  if (error) redirect(aiDestination(mode, "mealError", aiConsumptionError(error)));
  ["/macros", "/inventory", "/dashboard", "/meal-history", "/weekly-summary"].forEach((path) => revalidatePath(path));
  redirect(aiDestination(mode, "mealSuccess", "meal-consumed-logged"));
}
