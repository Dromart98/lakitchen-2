import { describe, expect, it } from "vitest";

import {
  buildProviderOutputForSavedPlan,
  cookSavedDailyPlanMealRequestSchema,
  saveDailyPlanRequestSchema,
  toSavedDailyPlan,
} from "@/modules/plans/saved-daily-plans";

const nutrition = { calories: 500, protein_g: 35, carbs_g: 55, fat_g: 15 };

function meal(mealType: "breakfast" | "lunch" | "snack" | "dinner", itemId: string) {
  return {
    meal_type: mealType,
    title: `Comida ${mealType}`,
    description: "Una comida sencilla y completa.",
    estimated_minutes: 20,
    ingredients: [{ inventory_item_id: itemId, name: `Producto ${itemId}`, quantity: 100, unit: "g" }],
    steps: ["Prepara todos los ingredientes necesarios.", "Cocina y sirve la comida preparada."],
    nutrition,
  };
}

function request() {
  return {
    plan_date: "2026-07-15",
    priority_mode: "balanced" as const,
    max_minutes_per_meal: 30 as const,
    plan: {
      status: "success" as const,
      target: { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 60 },
      total: { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 60 },
      difference: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      fit: "close" as const,
      meals: [
        meal("breakfast", "one"),
        meal("lunch", "two"),
        meal("snack", "three"),
        meal("dinner", "four"),
      ],
    },
  };
}

describe("saved daily plans", () => {
  it("accepts the exact save payload and rejects extra fields", () => {
    expect(saveDailyPlanRequestSchema.safeParse(request()).success).toBe(true);
    expect(saveDailyPlanRequestSchema.safeParse({ ...request(), user_id: "forbidden" }).success).toBe(false);
    expect(saveDailyPlanRequestSchema.safeParse({ ...request(), plan: { ...request().plan, fingerprint: "forbidden" } }).success).toBe(false);
  });

  it("removes client nutrition before server validation", () => {
    const parsed = saveDailyPlanRequestSchema.parse(request());
    const providerOutput = buildProviderOutputForSavedPlan(parsed);
    expect(providerOutput.status).toBe("success");
    expect(providerOutput.message).toBeNull();
    expect(providerOutput.meals).toHaveLength(4);
    expect(providerOutput.meals[0]).not.toHaveProperty("nutrition");
  });

  it("requires the canonical meal order", () => {
    const value = request();
    value.plan.meals.reverse();
    expect(saveDailyPlanRequestSchema.safeParse(value).success).toBe(false);
  });

  it("accepts only a saved plan id and a valid meal type for consumption", () => {
    const input = { plan_id: "11111111-1111-4111-8111-111111111111", meal_type: "lunch" };
    expect(cookSavedDailyPlanMealRequestSchema.safeParse(input).success).toBe(true);
    expect(cookSavedDailyPlanMealRequestSchema.safeParse({ ...input, user_id: "forbidden" }).success).toBe(false);
    expect(cookSavedDailyPlanMealRequestSchema.safeParse({ ...input, meal_type: "other" }).success).toBe(false);
  });

  it("parses completion snapshots and rejects unknown completion keys", () => {
    const value = request();
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      plan_date: "2026-07-15",
      priority_mode: value.priority_mode,
      max_minutes_per_meal: value.max_minutes_per_meal,
      target: value.plan.target,
      total: value.plan.total,
      difference: value.plan.difference,
      fit: value.plan.fit,
      meals: value.plan.meals,
      completed_meals: {
        breakfast: {
          meal_log_id: "22222222-2222-4222-8222-222222222222",
          completed_at: "2026-07-15T18:00:00.000Z",
        },
      },
      created_at: "2026-07-15T18:00:00.000Z",
    };

    expect(toSavedDailyPlan(row)?.completed_meals.breakfast?.meal_log_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(toSavedDailyPlan({ ...row, meals: row.meals.slice(0, 3) })).toBeNull();
    expect(toSavedDailyPlan({ ...row, completed_meals: { other: row.completed_meals.breakfast } })).toBeNull();
  });
});
