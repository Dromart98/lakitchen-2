"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { DAILY_PLAN_AI_MODEL_DEFAULT, generateDailyPlanWithOpenAi } from "@/lib/openai/daily-plan-generation";
import { classifyAiResult, createAiUsageMeter } from "@/lib/ai/metering";
import { hasCorrelation, withCorrelationIfMissing } from "@/lib/server/logger";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import {
  buildDailyPlanTarget,
  getDailyPlanInventoryReadiness,
  dailyPlanPublicRequestSchema,
  enrichDailyPlanWithDeterministicNutrition,
  validateDailyPlanProviderOutput,
  type DailyPlanActionResult,
} from "@/modules/plans/daily-plan-ai";
import {
  buildProviderOutputForSavedPlan,
  cookSavedDailyPlanMealRequestSchema,
  saveDailyPlanRequestSchema,
  type CookSavedDailyPlanMealResult,
  type SaveDailyPlanResult,
} from "@/modules/plans/saved-daily-plans";
import { canCookSavedPlanOnDate, isAllowedPlanDate, isValidDateKey } from "@/modules/plans/plan-date";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

const MIN_PLAN_INVENTORY_ITEMS = 2;
const PLAN_PATH = "/plan";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProfileRow = { target_calories: number | null; target_protein_g: number | null; target_carbs_g: number | null; target_fat_g: number | null };
type InventoryRow = { id: string; name: string; quantity: number | null; unit: string; expires_at: string | null; category: string | null; nutrition_basis: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };

async function loadDailyPlanContext(supabase: any, userId: string, planDateKey: string) {
  const { data: profile, error: profileError } = await supabase
    .from("user_nutrition_profiles")
    .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
    .eq("user_id", userId)
    .maybeSingle() as { data: ProfileRow | null; error: { message: string } | null };
  if (profileError) return { status: "error" as const, code: "unexpected-error" as const };

  const target = buildDailyPlanTarget(profile);
  if (!target) return { status: "error" as const, code: "profile-required" as const };

  const { data: inventoryData, error: inventoryError } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, unit, expires_at, category, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", userId)
    .order("name", { ascending: true }) as { data: InventoryRow[] | null; error: { message: string } | null };
  if (inventoryError) return { status: "error" as const, code: "unexpected-error" as const };

  const inventoryItems = getDailyPlanInventoryReadiness(inventoryData ?? [], planDateKey).usable;
  if (inventoryItems.length < MIN_PLAN_INVENTORY_ITEMS) return { status: "error" as const, code: "insufficient-inventory" as const };

  return { status: "success" as const, target, inventoryItems, planDateKey };
}

export async function generateDailyPlanAction(input: unknown): Promise<DailyPlanActionResult> {
  if (!hasCorrelation()) return withCorrelationIfMissing(() => generateDailyPlanAction(input));
  const request = dailyPlanPublicRequestSchema.safeParse(input);
  if (!request.success) return { status: "error", code: "invalid-input" };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "daily plan");
    if (!user) return { status: "error", code: "unauthenticated" };

    const model = process.env.OPENAI_DAILY_PLAN_MODEL ?? DAILY_PLAN_AI_MODEL_DEFAULT;
    const meter = createAiUsageMeter({ userId: user.id, feature: "daily_plan", model });
    if (!meter.authorizeFeature()) {
      await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
      return { status: "error", code: "ai-feature-disabled" };
    }

    const todayKey = getCurrentInventoryExpirationDateKey();
    if (!isAllowedPlanDate(request.data.plan_date, todayKey)) return { status: "error", code: "invalid-input" };

    const context = await loadDailyPlanContext(supabase, user.id, request.data.plan_date);
    if (context.status !== "success") return { status: "error", code: context.code };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { status: "error", code: "missing-api-key" };

    const generated = await generateDailyPlanWithOpenAi(request.data, context.target, context.inventoryItems, context.planDateKey, {
      apiKey,
      model,
      fetchImpl: meter.fetchImpl,
    });
    await meter.finish(classifyAiResult(generated));
    const accessError = meter.getAccessError();
    if (accessError) return { status: "error", code: accessError };
    if (generated.status !== "success") {
      if (context.inventoryItems.length <= 3 && (generated.status === "needs-clarification" || generated.code === "invalid-ai-response")) {
        return { status: "needs-clarification", message: "No se pudo construir un día completo con los productos utilizables actuales. Completa la nutrición de más productos o añade variedad al inventario." };
      }
      return generated;
    }

    const enriched = enrichDailyPlanWithDeterministicNutrition(generated.meals, context.inventoryItems, context.target);
    if (enriched.status === "error" && enriched.code === "nutrition-unavailable" && context.inventoryItems.length <= 3) {
      return { status: "needs-clarification", message: "No se pudo construir un día completo con los productos utilizables actuales. Completa la nutrición de más productos o añade variedad al inventario." };
    }
    return enriched;
  } catch {
    return { status: "error", code: "unexpected-error" };
  }
}

export async function saveDailyPlanAction(input: unknown): Promise<SaveDailyPlanResult> {
  const request = saveDailyPlanRequestSchema.safeParse(input);
  if (!request.success) return { status: "error", code: "invalid-input" };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "daily plan saving");
    if (!user) return { status: "error", code: "unauthenticated" };

    const todayKey = getCurrentInventoryExpirationDateKey();
    if (!isAllowedPlanDate(request.data.plan_date, todayKey)) return { status: "error", code: "invalid-plan-date" };

    const context = await loadDailyPlanContext(supabase, user.id, request.data.plan_date);
    if (context.status !== "success") {
      if (context.code === "profile-required") return { status: "error", code: "profile-required" };
      return { status: "error", code: "unexpected-error" };
    }

    const publicRequest = {
      plan_date: request.data.plan_date,
      priority_mode: request.data.priority_mode,
      max_minutes_per_meal: request.data.max_minutes_per_meal,
    };
    const validated = validateDailyPlanProviderOutput(
      publicRequest,
      context.inventoryItems,
      buildProviderOutputForSavedPlan(request.data),
      context.planDateKey,
    );
    if (validated.status !== "success") return { status: "error", code: "inventory-changed" };

    const enriched = enrichDailyPlanWithDeterministicNutrition(validated.meals, context.inventoryItems, context.target);
    if (enriched.status !== "success") return { status: "error", code: "inventory-changed" };

    const fingerprint = createHash("sha256").update(JSON.stringify({
      plan_date: request.data.plan_date,
      priority_mode: request.data.priority_mode,
      max_minutes_per_meal: request.data.max_minutes_per_meal,
      target: enriched.target,
      meals: enriched.meals,
    })).digest("hex");

    const { data, error } = await (supabase as any).rpc("save_scheduled_daily_plan", {
      p_plan_date: request.data.plan_date,
      p_priority_mode: request.data.priority_mode,
      p_max_minutes_per_meal: request.data.max_minutes_per_meal,
      p_target: enriched.target,
      p_total: enriched.total,
      p_difference: enriched.difference,
      p_fit: enriched.fit,
      p_meals: enriched.meals,
      p_fingerprint: fingerprint,
    }) as { data: string | null; error: { code?: string; message?: string } | null };

    if (error?.message?.includes("date_occupied")) return { status: "error", code: "date-occupied" };
    if (error?.message?.includes("invalid_plan_date")) return { status: "error", code: "invalid-plan-date" };
    if (error || !data || !UUID_PATTERN.test(data)) {
      console.warn("Supabase could not save the daily plan.");
      return { status: "error", code: "save-failed" };
    }

    revalidatePath(PLAN_PATH);
    return { status: "success", code: "saved", planId: data };
  } catch {
    return { status: "error", code: "unexpected-error" };
  }
}

export async function cookSavedDailyPlanMealAction(input: unknown): Promise<CookSavedDailyPlanMealResult> {
  const request = cookSavedDailyPlanMealRequestSchema.safeParse(input);
  if (!request.success) return { status: "error", code: "invalid-input" };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "saved daily plan meal cooking");
    if (!user) return { status: "error", code: "unauthenticated" };

    const { data: savedPlan, error: savedPlanError } = await (supabase as any).from("user_saved_daily_plans").select("plan_date").eq("id", request.data.plan_id).eq("user_id", user.id).maybeSingle() as { data: { plan_date: string } | null; error: { message: string } | null };
    if (savedPlanError) { console.warn("Supabase could not load the saved daily plan."); return { status: "error", code: "unexpected-error" }; }
    if (!savedPlan || !isValidDateKey(savedPlan.plan_date)) return { status: "error", code: "unexpected-error" };
    if (!canCookSavedPlanOnDate(savedPlan.plan_date, getCurrentInventoryExpirationDateKey())) return { status: "error", code: "not-yet-available" };

    const { data, error } = await (supabase as any).rpc("consume_saved_daily_plan_meal", {
      p_plan_id: request.data.plan_id,
      p_meal_type: request.data.meal_type,
    }) as { data: string | null; error: { code?: string; message: string } | null };

    if (error) {
      if (error.code === "23505") return { status: "error", code: "already-completed" };
      if (error.code === "P0002" || error.code === "22003" || error.code === "22023") {
        return { status: "error", code: "inventory-changed" };
      }
      console.warn("Supabase could not consume the saved plan meal.");
      return { status: "error", code: "unexpected-error" };
    }

    if (!data || !UUID_PATTERN.test(data)) return { status: "error", code: "unexpected-error" };

    revalidatePath(PLAN_PATH);
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/meal-history");
    return { status: "success", mealLogId: data };
  } catch {
    return { status: "error", code: "unexpected-error" };
  }
}

export async function deleteSavedDailyPlanAction(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "").trim();
  if (!UUID_PATTERN.test(planId)) return;

  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase, "saved daily plan deletion");
  if (!user) return;

  const { error } = await (supabase as any)
    .from("user_saved_daily_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", user.id)
    .select("id") as { error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not delete the saved daily plan.");
    return;
  }

  revalidatePath(PLAN_PATH);
}
