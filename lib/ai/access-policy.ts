import type { AiUsageFeature } from "@/lib/ai/metering";

export type AiPlan = "default";

const PLAN_FEATURES: Readonly<Record<AiPlan, Readonly<Record<AiUsageFeature, boolean>>>> = {
  default: {
    text_meal: true,
    photo_meal: true,
    inventory_nutrition: true,
    voice_inventory: true,
    voice_shopping: true,
    recipe_generation: true,
    daily_plan: true,
  },
};

export function isAiFeatureEnabled(plan: AiPlan, feature: AiUsageFeature): boolean {
  return PLAN_FEATURES[plan][feature];
}
