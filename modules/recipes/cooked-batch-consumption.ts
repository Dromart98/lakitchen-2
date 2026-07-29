import { isMealType, type MealType } from "@/modules/meals/meal-types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BATCH_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|\+00:00)$/;
const BASE_KEYS = ["request_id", "batch_id", "meal_type", "expected_batch_updated_at"] as const;
const CONSUMPTION_KEYS = ["servings_consumed", "cooked_weight_consumed_g"] as const;

export type ConsumeCookedBatchRequest = Readonly<{
  request_id: string;
  batch_id: string;
  meal_type: MealType;
  expected_batch_updated_at: string;
}> & (
  | Readonly<{ servings_consumed: number; cooked_weight_consumed_g?: never }>
  | Readonly<{ servings_consumed?: never; cooked_weight_consumed_g: number }>
);

export type ConsumeCookedBatchErrorCode =
  | "invalid-input"
  | "unauthenticated"
  | "batch-not-found"
  | "batch-version-conflict"
  | "batch-exhausted"
  | "insufficient-batch"
  | "idempotency-conflict"
  | "consumption-conflict";

export type ConsumeCookedBatchResult =
  | Readonly<{ status: "success" }>
  | Readonly<{ status: "error"; code: ConsumeCookedBatchErrorCode }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBatchVersion(value: unknown): string | null {
  if (typeof value !== "string" || !BATCH_VERSION_PATTERN.test(value)) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const canonical = parsed.toISOString();
  return canonical.endsWith(".000Z") || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(canonical)
    ? canonical
    : null;
}

export function parseConsumeCookedBatchInput(input: unknown): ConsumeCookedBatchRequest | null {
  if (!isPlainObject(input)) return null;
  const keys = Object.keys(input);
  const consumptionKeys = CONSUMPTION_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (consumptionKeys.length !== 1 || keys.length !== BASE_KEYS.length + 1) return null;
  if (keys.some((key) => !BASE_KEYS.includes(key as typeof BASE_KEYS[number]) && !CONSUMPTION_KEYS.includes(key as typeof CONSUMPTION_KEYS[number]))) return null;
  if (typeof input.request_id !== "string" || !UUID_PATTERN.test(input.request_id)) return null;
  if (typeof input.batch_id !== "string" || !UUID_PATTERN.test(input.batch_id)) return null;
  if (!isMealType(input.meal_type)) return null;
  const expectedBatchUpdatedAt = normalizeBatchVersion(input.expected_batch_updated_at);
  if (!expectedBatchUpdatedAt) return null;
  const consumptionKey = consumptionKeys[0];
  const amount = input[consumptionKey];
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;

  const base = {
    request_id: input.request_id,
    batch_id: input.batch_id,
    meal_type: input.meal_type,
    expected_batch_updated_at: expectedBatchUpdatedAt,
  };
  return consumptionKey === "servings_consumed"
    ? Object.freeze({ ...base, servings_consumed: amount })
    : Object.freeze({ ...base, cooked_weight_consumed_g: amount });
}

export function buildConsumeCookedBatchRpcPayload(request: ConsumeCookedBatchRequest): Record<string, unknown> {
  return {
    p_request_id: request.request_id,
    p_batch_id: request.batch_id,
    p_meal_type: request.meal_type,
    p_expected_batch_updated_at: request.expected_batch_updated_at,
    p_servings_consumed: request.servings_consumed ?? null,
    p_cooked_weight_consumed_g: request.cooked_weight_consumed_g ?? null,
  };
}

export function mapConsumeCookedBatchRpcError(error: { message?: string } | null | undefined): ConsumeCookedBatchErrorCode {
  const safeCodes: Record<string, ConsumeCookedBatchErrorCode> = {
    batch_not_found: "batch-not-found",
    batch_version_conflict: "batch-version-conflict",
    batch_exhausted: "batch-exhausted",
    insufficient_batch: "insufficient-batch",
    idempotency_conflict: "idempotency-conflict",
  };
  return safeCodes[error?.message ?? ""] ?? "consumption-conflict";
}
