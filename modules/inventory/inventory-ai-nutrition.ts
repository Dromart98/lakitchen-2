import { z } from "zod";

import { INVENTORY_CATEGORIES } from "@/modules/inventory/inventory-categories";
import { isInventoryNutritionBasis, type InventoryNutritionBasis } from "@/modules/inventory/inventory-nutrition";

export const INVENTORY_NUTRITION_AI_MODEL_DEFAULT =
  "gpt-5.6-terra";
export const INVENTORY_NUTRITION_AI_TIMEOUT_MS = 15_000;
export const INVENTORY_NUTRITION_AI_MAX_OUTPUT_TOKENS = 500;
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
    food_state: { type: "string", enum: ["raw", "cooked", "processed", "not_applicable", "unknown"] },
    normalized_food_name: { type: "string" },
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
    "food_state",
    "normalized_food_name",
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
export type InventoryNutritionAiFoodState = "raw" | "cooked" | "processed" | "not_applicable" | "unknown";

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
  | "food-state"
  | "normalized-food-name"
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
  food_state: z.enum(["raw", "cooked", "processed", "not_applicable", "unknown"]),
  normalized_food_name: z.string(),
  assumptions: z.string(),
  clarification: z.string().nullable(),
}).strict();

export type InventoryNutritionAiOutput = z.infer<typeof InventoryNutritionAiOutputSchema>;


function normalizeForFoodStateDetection(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsFoodStatePhrase(normalizedName: string, phrase: string) {
  return new RegExp(`(^|[^a-z0-9])${phrase.replace(/ /g, "\\s+")}([^a-z0-9]|$)`, "u").test(normalizedName);
}

export function detectExplicitInventoryFoodState(
  name: string,
): "raw" | "cooked" | "processed" | null {
  const normalizedName = normalizeForFoodStateDetection(name);
  const processed = ["en conserva", "embutido", "embutida", "fiambre", "precocinado", "precocinada", "preparado", "preparada"];
  const cooked = ["cocido", "cocida", "asado", "asada", "a la plancha", "plancha", "hervido", "hervida", "horneado", "horneada", "frito", "frita"];
  const raw = ["crudo", "cruda", "sin cocinar"];

  if (processed.some((phrase) => containsFoodStatePhrase(normalizedName, phrase))) return "processed";
  if (cooked.some((phrase) => containsFoodStatePhrase(normalizedName, phrase))) return "cooked";
  if (raw.some((phrase) => containsFoodStatePhrase(normalizedName, phrase))) return "raw";
  return null;
}

function isExcessivelyGenericFoodName(name: string) {
  const normalizedName = normalizeForFoodStateDetection(name);
  return normalizedName.length < 4 || normalizedName.split(" ").length <= 1;
}

function textMentionsUnprovidedMaterialAssumption(inputName: string, assumptions: string) {
  const normalizedInput = normalizeForFoodStateDetection(inputName);
  const normalizedAssumptions = normalizeForFoodStateDetection(assumptions);
  const materialMarkers = ["marca", "receta", "aceite", "salsa"];

  return materialMarkers.some((marker) => (
    containsFoodStatePhrase(normalizedAssumptions, marker)
    && !containsFoodStatePhrase(normalizedInput, marker)
  ));
}

function assumptionsIntroduceMismatchedFoodState(inputName: string, assumptions: string) {
  const inputState = detectExplicitInventoryFoodState(inputName);
  const assumptionsState = detectExplicitInventoryFoodState(assumptions);

  if (!assumptionsState) return false;
  if (!inputState) return true;
  return assumptionsState !== inputState;
}

function normalizedNameIntroducesPreparation(inputName: string, normalizedFoodName: string) {
  const explicitState = detectExplicitInventoryFoodState(inputName);
  const normalizedState = detectExplicitInventoryFoodState(normalizedFoodName);
  return normalizedState !== null && normalizedState !== explicitState;
}

function foodStateCanSubstantiallyChangeEstimate(input: InventoryNutritionAiInput) {
  return input.unit === "g" || input.unit === "kg" || input.category === "protein";
}

export function calibrateInventoryNutritionAiConfidence(
  input: InventoryNutritionAiInput,
  output: InventoryNutritionAiOutput,
): InventoryNutritionAiConfidence {
  if (output.confidence !== "high") return output.confidence;

  const explicitState = detectExplicitInventoryFoodState(input.name);
  if (output.food_state === "unknown") return "medium";
  if (!explicitState && output.food_state !== "not_applicable") return "medium";
  if (normalizedNameIntroducesPreparation(input.name, output.normalized_food_name)) return "medium";
  if (textMentionsUnprovidedMaterialAssumption(input.name, output.assumptions)) return "medium";
  if (assumptionsIntroduceMismatchedFoodState(input.name, output.assumptions)) return "medium";
  if (isExcessivelyGenericFoodName(input.name)) return "medium";

  return "high";
}

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
  const explicitFoodState = detectExplicitInventoryFoodState(input.name);

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

  const normalizedFoodName = output.normalized_food_name.trim();

  if (normalizedFoodName.length < 2 || normalizedFoodName.length > 120) {
    return { status: "invalid", reason: "normalized-food-name" };
  }

  if (explicitFoodState && output.food_state !== explicitFoodState) {
    return { status: "invalid", reason: "food-state" };
  }

  if (output.food_state === "unknown" && foodStateCanSubstantiallyChangeEstimate(input)) {
    return { status: "invalid", reason: "food-state" };
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
      confidence: calibrateInventoryNutritionAiConfidence(input, output),
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
