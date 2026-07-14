import { z } from "zod";

import { INVENTORY_CATEGORIES } from "@/modules/inventory/inventory-categories";
import { isInventoryNutritionBasis, type InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";

export const INVENTORY_NUTRITION_AI_MODEL_DEFAULT = "gpt-5.6-luna";
export const INVENTORY_NUTRITION_AI_TIMEOUT_MS = 15_000;
export const INVENTORY_NUTRITION_AI_MAX_OUTPUT_TOKENS = 300;
export const INVENTORY_NUTRITION_AI_PER_UNIT_MAX = 100_000;

const inventoryUnits = ["ud", "g", "kg", "ml", "l"] as const;

export const INVENTORY_NUTRITION_AI_JSON_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["estimated", "needs_clarification"] },
    nutrition_basis: {
      anyOf: [
        { type: "string", enum: ["per_100g", "per_100ml", "per_unit"] },
        { type: "null" },
      ],
    },
    calories: { anyOf: [{ type: "number" }, { type: "null" }] },
    protein_g: { anyOf: [{ type: "number" }, { type: "null" }] },
    carbs_g: { anyOf: [{ type: "number" }, { type: "null" }] },
    fat_g: { anyOf: [{ type: "number" }, { type: "null" }] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    assumptions: { type: "string" },
    clarification: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: [
    "status",
    "nutrition_basis",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "confidence",
    "assumptions",
    "clarification",
  ],
  additionalProperties: false,
} as const;

const inventoryCategories = [...INVENTORY_CATEGORIES] as const;

export type InventoryNutritionAiInput = {
  name: string;
  quantity: number | null;
  unit: (typeof inventoryUnits)[number];
  category: (typeof inventoryCategories)[number] | null;
};

export type InventoryNutritionAiConfidence = "low" | "medium" | "high";

export type InventoryNutritionAiEstimate = {
  nutrition_basis: InventoryNutritionBasis;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: InventoryNutritionAiConfidence;
  assumptions: string;
};

export type InventoryNutritionAiValidationFailureReason =
  | "schema"
  | "needs-clarification"
  | "basis"
  | "assumptions"
  | "values"
  | "limits";

export type InventoryNutritionAiValidationResult =
  | { status: "success"; estimate: InventoryNutritionAiEstimate }
  | { status: "needs-clarification"; message: string }
  | { status: "invalid"; reason: InventoryNutritionAiValidationFailureReason };

export const InventoryNutritionAiInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  quantity: z.number().finite().positive().nullable(),
  unit: z.enum(inventoryUnits),
  category: z.enum(inventoryCategories).nullable(),
}).strict();

export const InventoryNutritionAiOutputSchema = z.object({
  status: z.enum(["estimated", "needs_clarification"]),
  nutrition_basis: z.enum(["per_100g", "per_100ml", "per_unit"]).nullable(),
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.string(),
  clarification: z.string().nullable(),
}).strict();

export type InventoryNutritionAiOutput = z.infer<typeof InventoryNutritionAiOutputSchema>;

export function parseInventoryNutritionAiInput(input: unknown): InventoryNutritionAiInput | null {
  const parsed = InventoryNutritionAiInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function getExpectedInventoryNutritionBasis(unit: InventoryNutritionAiInput["unit"]): InventoryNutritionBasis {
  if (unit === "g" || unit === "kg") return "per_100g";
  if (unit === "ml" || unit === "l") return "per_100ml";
  return "per_unit";
}

export function isCompatibleInventoryNutritionAiBasis(unit: InventoryNutritionAiInput["unit"], basis: unknown): basis is InventoryNutritionBasis {
  return isInventoryNutritionBasis(basis) && basis === getExpectedInventoryNutritionBasis(unit);
}

function hasFiniteNonNegativeNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function valuesWithinDefensiveLimits(output: InventoryNutritionAiOutput) {
  const values = [output.protein_g, output.carbs_g, output.fat_g];

  if (output.nutrition_basis === "per_100g" || output.nutrition_basis === "per_100ml") {
    return output.calories !== null && output.calories <= 1000 && values.every((value) => value !== null && value <= 100);
  }

  return output.calories !== null
    && output.calories <= INVENTORY_NUTRITION_AI_PER_UNIT_MAX
    && values.every((value) => value !== null && value <= INVENTORY_NUTRITION_AI_PER_UNIT_MAX);
}

export function validateInventoryNutritionAiOutput(
  input: InventoryNutritionAiInput,
  rawOutput: unknown,
): InventoryNutritionAiValidationResult {
  const parsed = InventoryNutritionAiOutputSchema.safeParse(rawOutput);
  if (!parsed.success) return { status: "invalid", reason: "schema" };

  const output = parsed.data;

  if (output.status === "needs_clarification") {
    const clarification = output.clarification?.trim() ?? "";
    const hasNoNutrition = output.nutrition_basis === null
      && output.calories === null
      && output.protein_g === null
      && output.carbs_g === null
      && output.fat_g === null;

    if (!clarification || !hasNoNutrition) return { status: "invalid", reason: "needs-clarification" };
    return { status: "needs-clarification", message: clarification };
  }

  if (!isCompatibleInventoryNutritionAiBasis(input.unit, output.nutrition_basis)) {
    return { status: "invalid", reason: "basis" };
  }

  if (!output.assumptions.trim()) return { status: "invalid", reason: "assumptions" };

  const hasCompleteValues = hasFiniteNonNegativeNumber(output.calories)
    && hasFiniteNonNegativeNumber(output.protein_g)
    && hasFiniteNonNegativeNumber(output.carbs_g)
    && hasFiniteNonNegativeNumber(output.fat_g);

  if (!hasCompleteValues) return { status: "invalid", reason: "values" };
  if (!valuesWithinDefensiveLimits(output)) return { status: "invalid", reason: "limits" };

  const { nutrition_basis, calories, protein_g, carbs_g, fat_g } = output as InventoryNutritionAiOutput & {
    nutrition_basis: InventoryNutritionBasis;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };

  return {
    status: "success",
    estimate: {
      nutrition_basis,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      confidence: output.confidence,
      assumptions: output.assumptions.trim(),
    },
  };
}

export type InventoryNutritionExistingValues = {
  nutritionBasis: string | null | undefined;
  calories: string | null | undefined;
  proteinG: string | null | undefined;
  carbsG: string | null | undefined;
  fatG: string | null | undefined;
};

export function requiresInventoryNutritionAiOverwriteConfirmation(values: InventoryNutritionExistingValues): boolean {
  return [values.nutritionBasis, values.calories, values.proteinG, values.carbsG, values.fatG].some(
    (value) => String(value ?? "").trim().length > 0,
  );
}

export function buildInventoryNutritionAiInputText(input: InventoryNutritionAiInput): string {
  return [
    `Nombre: ${input.name}`,
    `Unidad: ${input.unit}`,
    `Cantidad de inventario (solo contexto, no multiplicar): ${input.quantity ?? "sin cantidad"}`,
    `Categoría (solo contexto): ${input.category ?? "sin categoría"}`,
  ].join("\n");
}
