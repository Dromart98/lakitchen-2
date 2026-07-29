import type { RecipeConsumptionLine } from "@/modules/recipes/recipe-consumption";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEASUREMENT_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INPUT_KEYS = ["recipe_id", "request_id", "expected_measurement_updated_at"] as const;

export type CreateSavedAiRecipeCookedBatchRequest = Readonly<{
  recipe_id: string;
  request_id: string;
  expected_measurement_updated_at: string;
}>;

export type CreateSavedAiRecipeCookedBatchErrorCode =
  | "invalid-input"
  | "unauthenticated"
  | "recipe-not-found"
  | "recipe-corrupt"
  | "measurement-required"
  | "measurement-conflict"
  | "recipe-stale"
  | "insufficient-stock"
  | "expired-item"
  | "nutrition-unavailable"
  | "incompatible-unit"
  | "too-many-items"
  | "equivalence-conflict"
  | "idempotency-conflict"
  | "creation-conflict"
  | "unexpected-error";

export type CreateSavedAiRecipeCookedBatchResult =
  | { status: "success" }
  | { status: "error"; code: CreateSavedAiRecipeCookedBatchErrorCode };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalMeasurementVersion(value: string): boolean {
  if (!MEASUREMENT_VERSION_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function parseCreateSavedAiRecipeCookedBatchInput(input: unknown): CreateSavedAiRecipeCookedBatchRequest | null {
  if (!isPlainObject(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== INPUT_KEYS.length || keys.some((key) => !INPUT_KEYS.includes(key as typeof INPUT_KEYS[number]))) return null;
  if (typeof input.recipe_id !== "string" || !UUID_PATTERN.test(input.recipe_id)) return null;
  if (typeof input.request_id !== "string" || !UUID_PATTERN.test(input.request_id)) return null;
  if (typeof input.expected_measurement_updated_at !== "string" || !isCanonicalMeasurementVersion(input.expected_measurement_updated_at)) return null;
  return Object.freeze({
    recipe_id: input.recipe_id,
    request_id: input.request_id,
    expected_measurement_updated_at: input.expected_measurement_updated_at,
  });
}

export function buildSavedAiRecipeCookedBatchRpcPayload(
  request: CreateSavedAiRecipeCookedBatchRequest,
  lines: readonly RecipeConsumptionLine[],
): Record<string, unknown> {
  return {
    p_request_id: request.request_id,
    p_recipe_id: request.recipe_id,
    p_expected_measurement_updated_at: request.expected_measurement_updated_at,
    p_lines: lines,
  };
}

export function mapCreateSavedAiRecipeCookedBatchRpcError(error: { message?: string } | null | undefined): CreateSavedAiRecipeCookedBatchErrorCode {
  const safeCodes: Record<string, CreateSavedAiRecipeCookedBatchErrorCode> = {
    recipe_not_found: "recipe-not-found",
    measurement_required: "measurement-required",
    measurement_conflict: "measurement-conflict",
    recipe_stale: "recipe-stale",
    insufficient_stock: "insufficient-stock",
    expired_item: "expired-item",
    nutrition_unavailable: "nutrition-unavailable",
    incompatible_unit: "incompatible-unit",
    equivalence_conflict: "equivalence-conflict",
    idempotency_conflict: "idempotency-conflict",
    too_many_items: "too-many-items",
  };
  return safeCodes[error?.message ?? ""] ?? "creation-conflict";
}