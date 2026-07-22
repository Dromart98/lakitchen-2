import { describe, expect, it } from "vitest";

import {
  buildInventoryDefaultRawFoodPromptInstruction,
  INVENTORY_VOICE_DEFAULT_RAW_FOODS,
  inventoryVoiceDefaultRawFoodsMatchDeterministicRules,
} from "@/modules/inventory/inventory-default-raw-prompt";
import { getInventoryNutritionFoodStateExpectation } from "@/modules/inventory/inventory-ai-nutrition";

describe("inventory default raw prompt contract", () => {
  it("keeps the prompt vocabulary aligned with deterministic raw-state rules", () => {
    expect(inventoryVoiceDefaultRawFoodsMatchDeterministicRules()).toBe(true);
    expect(INVENTORY_VOICE_DEFAULT_RAW_FOODS).toContain("arroz");
    expect(buildInventoryDefaultRawFoodPromptInstruction()).toContain("No supongas que arroz, pasta o legumbres están cocinados");
  });

  it.each([
    ["Arroz", "raw"],
    ["Arroz basmati", "raw"],
    ["Arroz integral", "raw"],
    ["Arroz cocido", "cooked"],
    ["Arroz hervido", "cooked"],
    ["Arroz frito", "cooked"],
  ] as const)("uses the expected state for %s", (name, state) => {
    expect(getInventoryNutritionFoodStateExpectation(name)?.state).toBe(state);
  });

  it("does not treat compound rice dishes as plain raw ingredients", () => {
    expect(getInventoryNutritionFoodStateExpectation("Arroz con pollo")).toBeNull();
    expect(getInventoryNutritionFoodStateExpectation("Ensalada de arroz")).toBeNull();
  });
});
