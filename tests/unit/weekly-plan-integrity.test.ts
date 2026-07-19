import { describe, expect, it } from "vitest";

import { dailyPlanPublicRequestSchema } from "@/modules/plans/daily-plan-ai";
import {
  groupSavedDailyPlansForAgenda,
  saveDailyPlanRequestSchema,
  toSavedDailyPlan,
  type SavedDailyPlan,
} from "@/modules/plans/saved-daily-plans";

const nutrition = {
  calories: 500,
  protein_g: 35,
  carbs_g: 55,
  fat_g: 15,
};

function meal(mealType: "breakfast" | "lunch" | "snack" | "dinner", itemId: string) {
  return {
    meal_type: mealType,
    title: `Comida ${mealType}`,
    description: "Una comida sencilla y completa.",
    estimated_minutes: 20,
    ingredients: [
      {
        inventory_item_id: itemId,
        name: `Producto ${itemId}`,
        quantity: 100,
        unit: "g",
      },
    ],
    steps: [
      "Prepara todos los ingredientes necesarios.",
      "Cocina y sirve la comida preparada.",
    ],
    nutrition,
  };
}

function saveRequest(planDate: string) {
  return {
    plan_date: planDate,
    priority_mode: "balanced" as const,
    max_minutes_per_meal: 30 as const,
    plan: {
      status: "success" as const,
      target: {
        calories: 2000,
        protein_g: 140,
        carbs_g: 220,
        fat_g: 60,
      },
      total: {
        calories: 2000,
        protein_g: 140,
        carbs_g: 220,
        fat_g: 60,
      },
      difference: {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      },
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

function savedPlan(id: string, planDate: string, createdAt: string): SavedDailyPlan {
  const request = saveRequest(planDate);
  return {
    id,
    plan_date: planDate,
    priority_mode: request.priority_mode,
    max_minutes_per_meal: request.max_minutes_per_meal,
    target: request.plan.target,
    total: request.plan.total,
    difference: request.plan.difference,
    fit: request.plan.fit,
    meals: request.plan.meals,
    completed_meals: {},
    created_at: createdAt,
  };
}

describe("weekly plan date schemas", () => {
  it("accepts real public request dates and rejects impossible or extended values", () => {
    const base = {
      priority_mode: "balanced",
      max_minutes_per_meal: 30,
    };

    expect(
      dailyPlanPublicRequestSchema.safeParse({
        ...base,
        plan_date: "2026-07-19",
      }).success,
    ).toBe(true);
    expect(
      dailyPlanPublicRequestSchema.safeParse({
        ...base,
        plan_date: "2028-02-29",
      }).success,
    ).toBe(true);
    expect(
      dailyPlanPublicRequestSchema.safeParse({
        ...base,
        plan_date: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      dailyPlanPublicRequestSchema.safeParse({
        ...base,
        plan_date: "2026-13-01",
      }).success,
    ).toBe(false);
    expect(
      dailyPlanPublicRequestSchema.safeParse({
        ...base,
        plan_date: "2026-07-19T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      dailyPlanPublicRequestSchema.safeParse({
        ...base,
        plan_date: "2026-07-19",
        user_id: "forbidden",
      }).success,
    ).toBe(false);
  });

  it("applies the same strict date validation to saved-plan requests", () => {
    expect(saveDailyPlanRequestSchema.safeParse(saveRequest("2026-07-19")).success).toBe(true);
    expect(saveDailyPlanRequestSchema.safeParse(saveRequest("2028-02-29")).success).toBe(true);
    expect(saveDailyPlanRequestSchema.safeParse(saveRequest("2026-02-30")).success).toBe(false);
    expect(saveDailyPlanRequestSchema.safeParse(saveRequest("2026-13-01")).success).toBe(false);
    expect(
      saveDailyPlanRequestSchema.safeParse(saveRequest("2026-07-19T00:00:00Z")).success,
    ).toBe(false);
    expect(
      saveDailyPlanRequestSchema.safeParse({
        ...saveRequest("2026-07-19"),
        user_id: "forbidden",
      }).success,
    ).toBe(false);
  });

  it("discards stored rows with impossible or extended dates", () => {
    const valid = savedPlan(
      "11111111-1111-4111-8111-111111111111",
      "2026-07-19",
      "2026-07-19T08:00:00.000Z",
    );

    expect(toSavedDailyPlan(valid)?.id).toBe(valid.id);
    expect(toSavedDailyPlan({ ...valid, plan_date: "2026-02-30" })).toBeNull();
    expect(toSavedDailyPlan({ ...valid, plan_date: "2026-07-19T00:00:00Z" })).toBeNull();
  });
});

describe("weekly saved-plan agenda grouping", () => {
  it("preserves every plan while selecting the newest plan for each agenda date", () => {
    const todayKey = "2026-07-19";
    const plans = [
      savedPlan(
        "11111111-1111-4111-8111-111111111111",
        "2026-07-20",
        "2026-07-18T08:00:00.000Z",
      ),
      savedPlan(
        "22222222-2222-4222-8222-222222222222",
        "2026-07-20",
        "2026-07-19T08:00:00.000Z",
      ),
      savedPlan(
        "33333333-3333-4333-8333-333333333333",
        "2026-07-19",
        "2026-07-19T07:00:00.000Z",
      ),
      savedPlan(
        "44444444-4444-4444-8444-444444444444",
        "2026-07-18",
        "2026-07-18T07:00:00.000Z",
      ),
      savedPlan(
        "55555555-5555-4555-8555-555555555555",
        "2026-07-27",
        "2026-07-18T09:00:00.000Z",
      ),
      savedPlan(
        "66666666-6666-4666-8666-666666666666",
        "2026-07-27",
        "2026-07-19T09:00:00.000Z",
      ),
    ];

    const grouped = groupSavedDailyPlansForAgenda(plans, todayKey);

    expect(grouped.dates).toHaveLength(7);
    expect(grouped.dates).toEqual([
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
    expect(grouped.primaryPlans[0]?.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(grouped.primaryPlans[1]?.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(grouped.primaryPlans[2]).toBeNull();
    expect(grouped.legacyDuplicates.map((plan) => plan.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(grouped.outsideWindow.map((plan) => plan.id)).toEqual([
      "66666666-6666-4666-8666-666666666666",
      "55555555-5555-4555-8555-555555555555",
      "44444444-4444-4444-8444-444444444444",
    ]);

    const groupedIds = [
      ...grouped.primaryPlans.filter((plan): plan is SavedDailyPlan => plan !== null),
      ...grouped.legacyDuplicates,
      ...grouped.outsideWindow,
    ].map((plan) => plan.id);
    const sourceIds = plans.map((plan) => plan.id);

    expect(new Set(groupedIds).size).toBe(groupedIds.length);
    expect([...groupedIds].sort()).toEqual([...sourceIds].sort());
  });
});
