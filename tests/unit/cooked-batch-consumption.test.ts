import { describe, expect, it } from "vitest";
import {
  buildConsumeCookedBatchRpcPayload,
  mapConsumeCookedBatchRpcError,
  parseConsumeCookedBatchInput,
} from "@/modules/recipes/cooked-batch-consumption";
import { calculateCookedBatchPortion } from "@/modules/recipes/cooked-batch-portion";

const base = {
  request_id: "77777777-7777-4777-8777-777777777777",
  batch_id: "33333333-3333-4333-8333-333333333333",
  meal_type: "lunch",
  expected_batch_updated_at: "2026-07-29T12:00:00.000Z",
} as const;

describe("cooked batch consumption contract", () => {
  it.each([
    { consumption: { servingsConsumed: 0.5 } as const, sqlWeight: 750 * (0.5 / 3) },
    { consumption: { cookedWeightConsumedG: 125 } as const, sqlWeight: 125 },
    { consumption: { servingsConsumed: 3 } as const, sqlWeight: 750 },
  ])("matches the SQL weight, servings and nutrition equations: %j", ({ consumption, sqlWeight }) => {
    const total = { calories: 900.25, proteinG: 60.5, carbsG: 90.75, fatG: 30.125 };
    const result = calculateCookedBatchPortion({
      resolvedNutritionTotal: total,
      confirmedMeasurement: { rawWeightG: 1_000, cookedWeightG: 750, servings: 3 },
      consumption,
    });
    const sqlFraction = sqlWeight / 750;
    expect(result.consumedWeightG).toBe(sqlWeight);
    expect(result.consumedServings).toBe(3 * sqlFraction);
    expect(result.consumedNutrition).toEqual({
      calories: total.calories * sqlFraction,
      proteinG: total.proteinG * sqlFraction,
      carbsG: total.carbsG * sqlFraction,
      fatG: total.fatG * sqlFraction,
    });
  });

  it.each([
    { servings_consumed: 0.5 },
    { cooked_weight_consumed_g: 125.25 },
  ])("accepts exactly one positive explicit consumption basis: %j", (consumption) => {
    expect(parseConsumeCookedBatchInput({ ...base, ...consumption })).toEqual({ ...base, ...consumption });
  });

  it.each([
    {},
    { servings_consumed: 1, cooked_weight_consumed_g: 250 },
    { servings_consumed: 0 },
    { cooked_weight_consumed_g: Number.NaN },
    { servings_consumed: 1, user_id: base.batch_id },
    { servings_consumed: 1, expected_batch_updated_at: "2026-07-29T12:00:00Z" },
    { servings_consumed: 1, meal_type: "brunch" },
  ])("rejects malformed or over-posted input: %j", (change) => {
    expect(parseConsumeCookedBatchInput({ ...base, ...change })).toBeNull();
  });

  it("passes only the six RPC arguments and represents the absent unit as null", () => {
    const request = parseConsumeCookedBatchInput({ ...base, servings_consumed: 0.5 });
    expect(request && buildConsumeCookedBatchRpcPayload(request)).toEqual({
      p_request_id: base.request_id,
      p_batch_id: base.batch_id,
      p_meal_type: "lunch",
      p_expected_batch_updated_at: base.expected_batch_updated_at,
      p_servings_consumed: 0.5,
      p_cooked_weight_consumed_g: null,
    });
  });

  it("maps database messages to a finite set of safe codes", () => {
    expect(mapConsumeCookedBatchRpcError({ message: "batch_version_conflict" })).toBe("batch-version-conflict");
    expect(mapConsumeCookedBatchRpcError({ message: "insufficient_batch" })).toBe("insufficient-batch");
    expect(mapConsumeCookedBatchRpcError({ message: "idempotency_conflict" })).toBe("idempotency-conflict");
    expect(mapConsumeCookedBatchRpcError({ message: "secret relation leaked" })).toBe("consumption-conflict");
  });
});
