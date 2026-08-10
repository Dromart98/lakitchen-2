import {
  TEXT_MEAL_JSON_SCHEMA,
  validateTextMealProviderOutput,
  type TextMealEstimationResult,
} from "@/modules/meals/text-meal-ai";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const TEXT_MEAL_AI_MODEL_DEFAULT = "gpt-5.6-terra";
export const TEXT_MEAL_AI_TIMEOUT_MS = 20_000;
export const TEXT_MEAL_SYSTEM_PROMPT = `Analiza descripciones de comidas en español y devuelve una estimación nutricional, no un registro de comida. Identifica únicamente los ingredientes mencionados, sus cantidades, unidades y preparación. Para cada ingrediente devuelve normalized_name (nombre alimentario simple), display_name (texto claro para la persona), name (igual a display_name por compatibilidad) y confianza individual. No inventes ingredientes, aceite, salsas ni aderezos que no se hayan indicado.

Las cantidades aproximadas son válidas: estima prudentemente "un tomate pequeño", "una manzana mediana", "un huevo L", lonchas, cucharadas, cucharaditas, latas, tazas y un plato normal. Declara cada equivalencia de peso o cantidad aproximada en assumptions y usa confianza medium o low; no la presentes como exacta.

La preparación explícita tiene prioridad. Si se indica cocido, cocinada, a la plancha, frito, asado, horneado, hervido o equivalente, usa ese estado. Si no se indica preparación, aplica crudo por defecto a pollo, pavo, carnes, pescados, arroz, pasta, legumbres secas, verduras y huevos: "200 g de pollo debe tratarse como pollo crudo" y "100 g de arroz debe tratarse como arroz crudo". Incluye la preparación asumida tanto en el ingrediente como en assumptions. No apliques ese valor por defecto a productos listos para consumir como jamón, queso, pan, leche, yogur, salsas o conservas.

Usa needs-clarification solo cuando no puedas identificar el alimento, haya interpretaciones totalmente distintas, no exista una referencia razonable de cantidad o sea imposible una aproximación prudente. No solicites aclaración solo porque una cantidad sea aproximada. Usa solo estas unidades: g, ml, unidad, loncha, cucharadita, cucharada, taza, lata o plato (en singular o plural). Calcula macros finitos y no negativos. No des consejos médicos, no afirmes exactitud ni que la comida se ha guardado. Si status es success, message debe ser null. Si status es needs-clarification, suggested_name, ingredients, assumptions y confidence deben ser null. Devuelve únicamente JSON conforme al JSON Schema.`;

export const TEXT_MEAL_RETRY_INSTRUCTION = `Segundo intento: corrige la respuesta anterior sin relajar ninguna regla. Si la descripción contiene una cantidad explícita para un alimento identificable, usa una referencia nutricional genérica razonable y devuelve success salvo que exista una ambigüedad realmente irresoluble. Mantén exactamente el JSON Schema y todos los límites numéricos.`;
const EXPLICIT_QUANTITY_PATTERN_SOURCE = String.raw`\b\d+(?:[.,]\d+)?\s*(?:g|gr|gramos?|kg|ml|l|litros?|unidades?|uds?|lonchas?|cucharaditas?|cucharadas?|tazas?|latas?|platos?)\b`;

// This object is also the deterministic cache contract. Keep every setting
// capable of changing a successful provider result here and consume it below.
export const TEXT_MEAL_PROVIDER_CONTRACT = {
  endpoint: OPENAI_RESPONSES_ENDPOINT,
  systemPrompt: TEXT_MEAL_SYSTEM_PROMPT,
  retryInstruction: TEXT_MEAL_RETRY_INSTRUCTION,
  retryPolicy: {
    errorCodes: ["invalid-ai-response"],
    needsClarification: {
      enabled: true,
      requiresExplicitQuantity: true,
      explicitQuantityPattern: { source: EXPLICIT_QUANTITY_PATTERN_SOURCE, flags: "i" },
    },
  },
  responseFormat: { type: "json_schema", name: "text_meal_estimation", strict: true, schema: TEXT_MEAL_JSON_SCHEMA },
  store: false,
  reasoning: { effort: "low" },
  maxOutputTokens: 2500,
} as const;

type ProviderOptions = { apiKey: string; model?: string; fetchImpl?: typeof fetch };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extract(body: unknown): string | null {
  if (!record(body) || body.status !== "completed") return null;
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text;
  if (!Array.isArray(body.output)) return null;
  for (const item of body.output) {
    if (!record(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (record(content) && content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

// Structured Outputs guarantees the declared field types, but the shared flat
// schema cannot express status-dependent nullability. Discard only fields that
// are irrelevant for the selected status before running the strict validator.
export function normalizeTextMealProviderOutput(value: unknown): unknown {
  if (!record(value)) return value;
  if (value.status === "success") return { ...value, message: null };
  if (value.status === "needs-clarification") {
    return {
      ...value,
      suggested_name: null,
      ingredients: null,
      assumptions: null,
      confidence: null,
    };
  }
  return value;
}

function shouldRetry(result: TextMealEstimationResult, description: string) {
  const policy = TEXT_MEAL_PROVIDER_CONTRACT.retryPolicy;
  if (result.status === "error") return policy.errorCodes.some((code) => code === result.code);
  if (result.status !== "needs-clarification" || !policy.needsClarification.enabled) return false;
  if (!policy.needsClarification.requiresExplicitQuantity) return true;
  const { source, flags } = policy.needsClarification.explicitQuantityPattern;
  return new RegExp(source, flags).test(description);
}

async function requestTextMealAttempt(
  description: string,
  options: ProviderOptions,
  retry: boolean,
): Promise<TextMealEstimationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEXT_MEAL_AI_TIMEOUT_MS);
  try {
    const systemPrompt = retry ? `${TEXT_MEAL_PROVIDER_CONTRACT.systemPrompt}\n\n${TEXT_MEAL_PROVIDER_CONTRACT.retryInstruction}` : TEXT_MEAL_PROVIDER_CONTRACT.systemPrompt;
    const response = await (options.fetchImpl ?? fetch)(TEXT_MEAL_PROVIDER_CONTRACT.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? TEXT_MEAL_AI_MODEL_DEFAULT,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description },
        ],
        text: {
          format: {
            ...TEXT_MEAL_PROVIDER_CONTRACT.responseFormat,
          },
        },
        store: TEXT_MEAL_PROVIDER_CONTRACT.store,
        reasoning: TEXT_MEAL_PROVIDER_CONTRACT.reasoning,
        max_output_tokens: TEXT_MEAL_PROVIDER_CONTRACT.maxOutputTokens,
      }),
      signal: controller.signal,
    });

    if (response.status === 408) return { status: "error", code: "provider-timeout" };
    if (!response.ok) return { status: "error", code: "provider-error" };

    const text = extract(await response.json());
    if (!text) return { status: "error", code: "invalid-ai-response" };
    try {
      return validateTextMealProviderOutput(normalizeTextMealProviderOutput(JSON.parse(text)));
    } catch {
      return { status: "error", code: "invalid-ai-response" };
    }
  } catch (error) {
    return record(error) && error.name === "AbortError"
      ? { status: "error", code: "provider-timeout" }
      : { status: "error", code: "provider-error" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function estimateTextMealWithOpenAi(
  description: string,
  options: ProviderOptions,
): Promise<TextMealEstimationResult> {
  const first = await requestTextMealAttempt(description, options, false);
  if (!shouldRetry(first, description)) return first;
  return requestTextMealAttempt(description, options, true);
}
