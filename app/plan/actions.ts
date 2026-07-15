"use server";

import { generateDailyPlanWithOpenAi } from "@/lib/openai/daily-plan-generation";
import { getCurrentInventoryExpirationDateKey } from "@/modules/inventory/inventory-expiration";
import {
  buildDailyPlanTarget,
  buildUsableDailyPlanInventoryItems,
  dailyPlanPublicRequestSchema,
  enrichDailyPlanWithDeterministicNutrition,
  type DailyPlanActionResult,
} from "@/modules/plans/daily-plan-ai";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

const MIN_PLAN_INVENTORY_ITEMS = 2;

type ProfileRow = { target_calories: number | null; target_protein_g: number | null; target_carbs_g: number | null; target_fat_g: number | null };
type InventoryRow = { id: string; name: string; quantity: number | null; unit: string; expires_at: string | null; category: string | null; nutrition_basis: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };

export async function generateDailyPlanAction(input: unknown): Promise<DailyPlanActionResult> {
  const request = dailyPlanPublicRequestSchema.safeParse(input);
  if (!request.success) return { status: "error", code: "invalid-input" };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase, "daily plan");
    if (!user) return { status: "error", code: "unauthenticated" };

    const { data: profile, error: profileError } = await (supabase as any)
      .from("user_nutrition_profiles")
      .select("target_calories, target_protein_g, target_carbs_g, target_fat_g")
      .eq("user_id", user.id)
      .maybeSingle() as { data: ProfileRow | null; error: { message: string } | null };
    if (profileError) return { status: "error", code: "unexpected-error" };

    const target = buildDailyPlanTarget(profile);
    if (!target) return { status: "error", code: "profile-required" };

    const { data: inventoryData, error: inventoryError } = await (supabase as any)
      .from("inventory_items")
      .select("id, name, quantity, unit, expires_at, category, nutrition_basis, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", user.id)
      .gt("quantity", 0)
      .order("name", { ascending: true }) as { data: InventoryRow[] | null; error: { message: string } | null };
    if (inventoryError) return { status: "error", code: "unexpected-error" };

    const todayKey = getCurrentInventoryExpirationDateKey();
    const inventoryItems = buildUsableDailyPlanInventoryItems(inventoryData ?? [], todayKey);
    if (inventoryItems.length < MIN_PLAN_INVENTORY_ITEMS) return { status: "error", code: "insufficient-inventory" };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { status: "error", code: "missing-api-key" };

    const generated = await generateDailyPlanWithOpenAi(request.data, target, inventoryItems, todayKey, {
      apiKey,
      model: process.env.OPENAI_DAILY_PLAN_MODEL,
    });
    if (generated.status !== "success") return generated;

    return enrichDailyPlanWithDeterministicNutrition(generated.meals, inventoryItems, target);
  } catch {
    return { status: "error", code: "unexpected-error" };
  }
}
