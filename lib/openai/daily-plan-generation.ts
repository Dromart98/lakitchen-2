import { createLogger } from "@/lib/server/logger";
import {
  buildDailyPlanInputText,
  DAILY_PLAN_JSON_SCHEMA,
  type DailyPlanGenerationResult,
  type DailyPlanInventoryItem,
  type DailyPlanPublicRequest,
  type DailyPlanTarget,
  validateDailyPlanProviderOutput,
} from "@/modules/plans/daily-plan-ai";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const DAILY_PLAN_AI_MODEL_DEFAULT = "gpt-5.6-terra";
export const DAILY_PLAN_AI_TIMEOUT_MS = 40_000;
export const DAILY_PLAN_AI_RETRY_TIMEOUT_MS = 25_000;
export const DAILY_PLAN_AI_MAX_OUTPUT_TOKENS = 6_000;
export const DAILY_PLAN_AI_MAX_ATTEMPTS = 2;

export const DAILY_PLAN_SYSTEM_PROMPT = `Genera una vista previa temporal de un plan diario en español con desayuno, comida, merienda y cena usando exclusivamente el inventario enviado.
OpenAI decide combinaciones y cantidades, pero no debe incluir calorías ni macronutrientes porque el servidor los calculará después con datos reales.
No inventes ingredientes, suplementos ni productos externos. No cambies unidades. No superes cantidades disponibles ni en una comida ni en el total del día.
Respeta el tiempo máximo por comida, crea comidas normales y coherentes, evita planes formados solo por productos aislados cuando sea posible y devuelve exactamente una comida de cada tipo en este orden: breakfast, lunch, snack, dinner.
Intenta acercarte a los objetivos numéricos diarios y distribuir razonablemente calorías y proteína entre las cuatro comidas.
No des consejos médicos ni presentes el plan como prescripción sanitaria. No afirmes que se guarda, consume inventario o registra comidas.
reference_date es la fecha para la que se prepara el plan. Un alimento caducado antes de reference_date no puede utilizarse.
Si priority_mode es expiration, usa expiration_context.reference_date y expiration_context.urgent_inventory_item_ids como autoridad del servidor: prioriza productos que caducan hoy o en los próximos siete días, incluye al menos un ID urgente cuando exista alguno y prefiere caducidad más cercana.
Si status es success, message debe ser null y meals debe contener exactamente las cuatro comidas. Si status no es success, meals debe ser un array vacío.
Antes de responder, verifica que cada inventory_item_id, name y unit corresponda exactamente al inventario, que no repitas un producto dentro de una misma comida, que la suma diaria de cada producto no supere su cantidad disponible y que estimated_minutes no supere max_minutes_per_meal.
Devuelve solo JSON conforme al esquema estricto.`;

const DAILY_PLAN_RETRY_INSTRUCTION = `REINTENTO DE VALIDACIÓN: la propuesta anterior no superó todas las reglas deterministas del servidor. Regenera el plan desde cero y verifica especialmente el orden breakfast/lunch/snack/dinner, el tiempo máximo, IDs/nombres/unidades exactos, ausencia de ingredientes duplicados dentro de cada comida y stock acumulado de todo el día.`;

type ExtractionResult =
  | { status: "success"; text: string }
  | { status: "provider-error" | "incomplete-response" | "refusal" | "invalid-ai-response" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function extractDailyPlanOutputText(responseBody: unknown): ExtractionResult {
  if (!isRecord(responseBody)) return { status: "invalid-ai-response" };
  if (responseBody.error !== undefined && responseBody.error !== null) return { status: "provider-error" };
  if (responseBody.status === "incomplete") return { status: "incomplete-response" };
  if (responseBody.status !== "completed") return { status: "invalid-ai-response" };

  const outputText = getNonEmptyString(responseBody.output_text);
  if (outputText) return { status: "success", text: outputText };
  if (!Array.isArray(responseBody.output)) return { status: "invalid-ai-response" };

  for (const outputItem of responseBody.output) {
    if (!isRecord(outputItem) || outputItem.type !== "message" || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) continue;
      if (contentItem.type === "refusal") return { status: "refusal" };
      if (contentItem.type === "output_text") {
        const text = getNonEmptyString(contentItem.text);
        if (text) return { status: "success", text };
      }
    }
  }

  return { status: "invalid-ai-response" };
}

// Structured Outputs guarantees the declared field types, but the shared flat
// schema cannot express status-dependent nullability. Discard only fields that
// are irrelevant for the selected status before running the strict validator.
export function normalizeDailyPlanProviderOutput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.status === "success") return { ...value, message: null };
  if (value.status === "needs-clarification" || value.status === "error") {
    return { ...value, meals: [] };
  }
  return value;
}

function parseDailyPlanResponse(request: DailyPlanPublicRequest, inventoryItems: DailyPlanInventoryItem[], referenceDate: string, responseBody: unknown): DailyPlanGenerationResult {
  const extracted = extractDailyPlanOutputText(responseBody);
  if (extracted.status !== "success") {
    createLogger("ai", "daily_plan_generation").warn("provider_response_rejected", { reason: extracted.status });
    return { status: "error", code: extracted.status === "provider-error" ? "provider-error" : "invalid-ai-response" };
  }
  try {
    const parsed = normalizeDailyPlanProviderOutput(JSON.parse(extracted.text) as unknown);
    const validated = validateDailyPlanProviderOutput(request, inventoryItems, parsed, referenceDate);
    if (validated.status === "error" && validated.code === "invalid-ai-response") {
      createLogger("ai", "daily_plan_generation").warn("provider_response_rejected", { reason: "semantic-validation" });
    }
    return validated;
  } catch {
    createLogger("ai", "daily_plan_generation").warn("provider_response_rejected", { reason: "invalid-json" });
    return { status: "error", code: "invalid-ai-response" };
  }
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

async function generateDailyPlanAttempt(
  request: DailyPlanPublicRequest,
  target: DailyPlanTarget,
  inventoryItems: DailyPlanInventoryItem[],
  referenceDate: string,
  options: { apiKey: string; model?: string; fetchImpl?: typeof fetch },
  attempt: number,
): Promise<DailyPlanGenerationResult> {
  const controller = new AbortController();
  const timeoutMs = attempt === 0 ? DAILY_PLAN_AI_TIMEOUT_MS : DAILY_PLAN_AI_RETRY_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const systemPrompt = attempt === 0
    ? DAILY_PLAN_SYSTEM_PROMPT
    : `${DAILY_PLAN_SYSTEM_PROMPT}\n\n${DAILY_PLAN_RETRY_INSTRUCTION}`;

  try {
    const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? DAILY_PLAN_AI_MODEL_DEFAULT,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildDailyPlanInputText(request, target, inventoryItems, referenceDate) },
        ],
        text: { format: { type: "json_schema", name: "daily_meal_plan", strict: true, schema: DAILY_PLAN_JSON_SCHEMA } },
        store: false,
        max_output_tokens: DAILY_PLAN_AI_MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low" },
      }),
      signal: controller.signal,
    });

    if (response.status === 408) return { status: "error", code: "provider-timeout" };
    if (!response.ok) return { status: "error", code: "provider-error" };
    return parseDailyPlanResponse(request, inventoryItems, referenceDate, await response.json() as unknown);
  } catch (error) {
    if (isAbortError(error)) return { status: "error", code: "provider-timeout" };
    return { status: "error", code: "provider-error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateDailyPlanWithOpenAi(
  request: DailyPlanPublicRequest,
  target: DailyPlanTarget,
  inventoryItems: DailyPlanInventoryItem[],
  referenceDate: string,
  options: { apiKey: string; model?: string; fetchImpl?: typeof fetch },
): Promise<DailyPlanGenerationResult> {
  for (let attempt = 0; attempt < DAILY_PLAN_AI_MAX_ATTEMPTS; attempt += 1) {
    const result = await generateDailyPlanAttempt(request, target, inventoryItems, referenceDate, options, attempt);
    const canRetry = result.status === "error" && result.code === "invalid-ai-response" && attempt + 1 < DAILY_PLAN_AI_MAX_ATTEMPTS;
    if (!canRetry) return result;
  }

  return { status: "error", code: "invalid-ai-response" };
}
