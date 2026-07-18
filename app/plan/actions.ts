"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { generateDailyPlanWithOpenAi } from "@/lib/openai/daily-plan-generation";
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
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

const MIN_PLAN_INVENTORY_ITEMS = 2;
const PLAN_PATH = "/plan";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProfileRow = { target_calories: number | null; target_protein_g: number | null; target_carbs_g: number | null; target_fat_g: number | null };
type InventoryRow = { id: string; name: string; quantity: number | null; unit: string; expires_at: string | null; category: string | null; nutrition_basis: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };

async function loadDailyPlanContext(supabase: any, userId: string) {
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

  const todayKey = getCurrentInventoryExpirationDateKey();
  const inventoryItems = getDailyPlanInventoryReadiness(inventoryData ?? [], todayKey).usable;
  if (inventoryItems.length < MIN_PLAN_INVENTORY_ITEMS) return { status: "error" as const, code: "insufficient-inventory" as const };

  return { status: "success" as const, target, inventoryItems, todayKey };
}

export async function generateDailyPlanAction(input: unknown): Promise<DailyPlanActionResult> {
  const request = dailyPlanPublicRequestSchema.safeParse(input);
  if (!request.success) return { status: "error", code: "invalid-input" };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "daily plan");
    if (!user) return { status: "error", code: "unauthenticated" };

    const context = await loadDailyPlanContext(supabase, user.id);
    if (context.status !== "success") return { status: "error", code: context.code };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { status: "error", code: "missing-api-key" };

    const generated = await generateDailyPlanWithOpenAi(request.data, context.target, context.inventoryItems, context.todayKey, {
      apiKey,
      model: process.env.OPENAI_DAILY_PLAN_MODEL,
    });
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

    const context = await loadDailyPlanContext(supabase, user.id);
    if (context.status !== "success") {
      if (context.code === "profile-required") return { status: "error", code: "profile-required" };
      return { status: "error", code: "unexpected-error" };
    }

    const publicRequest = {
      priority_mode: request.data.priority_mode,
      max_minutes_per_meal: request.data.max_minutes_per_meal,
    };
    const validated = validateDailyPlanProviderOutput(
      publicRequest,
      context.inventoryItems,
      buildProviderOutputForSavedPlan(request.data),
      context.todayKey,
    );
    if (validated.status !== "success") return { status: "error", code: "inventory-changed" };

    const enriched = enrichDailyPlanWithDeterministicNutrition(validated.meals, context.inventoryItems, context.target);
    if (enriched.status !== "success") return { status: "error", code: "inventory-changed" };

    const fingerprint = createHash("sha256").update(JSON.stringify({
      priority_mode: request.data.priority_mode,
      max_minutes_per_meal: request.data.max_minutes_per_meal,
      target: enriched.target,
      meals: enriched.meals,
    })).digest("hex");

    const { data, error } = await (supabase as any)
      .from("user_saved_daily_plans")
      .insert({
        user_id: user.id,
        plan_date: context.todayKey,
        priority_mode: request.data.priority_mode,
        max_minutes_per_meal: request.data.max_minutes_per_meal,
        target: enriched.target,
        total: enriched.total,
        difference: enriched.difference,
        fit: enriched.fit,
        meals: enriched.meals,
        fingerprint,
      })
      .select("id")
      .single() as { data: { id: string } | null; error: { code?: string; message: string } | null };

    if (error?.code === "23505") {
      const { data: existing } = await (supabase as any)
        .from("user_saved_daily_plans")
        .select("id")
        .eq("user_id", user.id)
        .eq("fingerprint", fingerprint)
        .maybeSingle() as { data: { id: string } | null };
      if (existing?.id) return { status: "success", code: "already-saved", planId: existing.id };
    }

    if (error || !data?.id) {
      console.warn("Supabase could not save the daily plan.");
      return { status: "error", code: "save-failed" };
    }

    revalidatePath(PLAN_PATH);
    return { status: "success", code: "saved", planId: data.id };
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
