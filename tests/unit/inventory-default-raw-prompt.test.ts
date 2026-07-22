import { describe, expect, it } from "vitest";

import {
  buildInventoryDefaultRawFoodPromptInstruction,
  INVENTORY_VOICE_DEFAULT_RAW_EXCLUSIONS,
  INVENTORY_VOICE_DEFAULT_RAW_FOODS,
  inventoryVoiceDefaultRawFoodsMatchDeterministicRules,
} from "@/modules/inventory/inventory-default-raw-prompt";
import { getInventoryNutritionFoodStateExpectation } from "@/modules/inventory/inventory-ai-nutrition";

describe("inventory default raw prompt contract", () => {
  it("keeps the prompt vocabulary aligned with deterministic raw-state rules", () => {
    expect(inventoryVoiceDefaultRawFoodsMatchDeterministicRules()).toBe(true);
    expect(INVENTORY_VOICE_DEFAULT_RAW_FOODS).toContain("arroz");
    expect(INVENTORY_VOICE_DEFAULT_RAW_EXCLUSIONS).toEqual(expect.arrayContaining(["pasta fresca", "pasta con", "arroz con"]));
    const instruction = buildInventoryDefaultRawFoodPromptInstruction();
    expect(instruction).toContain("No apliques esta regla a platos compuestos");
    expect(instruction).toContain("No supongas que arroz, pasta seca o legumbres secas están cocinados");
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

  it("does not treat excluded or compound dishes as plain raw ingredients", () => {
    for (const name of ["Arroz con pollo", "Ensalada de arroz", "Pasta fresca", "Pasta con tomate"]) {
      expect(getInventoryNutritionFoodStateExpectation(name)).toBeNull();
    }
  });
});
