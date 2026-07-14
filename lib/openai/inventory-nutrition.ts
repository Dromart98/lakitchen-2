import {
  buildInventoryNutritionAiInputText,
  INVENTORY_NUTRITION_AI_JSON_SCHEMA,
  INVENTORY_NUTRITION_AI_MAX_OUTPUT_TOKENS,
  INVENTORY_NUTRITION_AI_MODEL_DEFAULT,
  INVENTORY_NUTRITION_AI_TIMEOUT_MS,
  validateInventoryNutritionAiOutput,
  type InventoryNutritionAiEstimate,
  type InventoryNutritionAiInput,
} from "@/modules/inventory/inventory-ai-nutrition";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export type InventoryNutritionProviderResult =
  | { status: "success"; estimate: InventoryNutritionAiEstimate }
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response" };

export const INVENTORY_NUTRITION_AI_SYSTEM_PROMPT = `Estima valores nutricionales típicos de un alimento o producto.
Los valores deben corresponder a la base nutricional, no al total comprado.
Para unidades g o kg, devuelve valores por 100 g con nutrition_basis per_100g.
Para unidades ml o l, devuelve valores por 100 ml con nutrition_basis per_100ml.
Para unidad ud, devuelve valores por una unidad con nutrition_basis per_unit.
No multipliques calorías ni macros por la cantidad del inventario.
Utiliza la categoría únicamente como contexto.
No inventes marca, receta, peso por unidad ni preparación concreta.
Si status es estimated, devuelve los cuatro valores nutricionales, assumptions con una frase breve y clarification como null.
Si el nombre es demasiado ambiguo, devuelve status needs_clarification, clarification con una pregunta breve y deja nutrition_basis, calories, protein_g, carbs_g y fat_g en null.
Si hay varias versiones razonables, usa una estimación típica y marca confidence low.
Escribe assumptions y clarification en español.
No afirmes que la estimación procede de una etiqueta, base de datos o fuente verificada.
No incluyas explicaciones fuera del esquema estructurado.`;

type OpenAiResponseObject = {
  status?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  output?: unknown;
  output_text?: unknown;
};

type ExtractionResult =
  | { status: "success"; text: string }
  | { status: "provider-error"; reason: "response-error" }
  | {
      status: "invalid-ai-response";
      reason:
        | "response-not-object"
        | "response-incomplete-max-output-tokens"
        | "response-incomplete-content-filter"
        | "response-incomplete-other"
        | "response-status"
        | "response-output-missing"
        | "response-refusal";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getIncompleteReason(value: unknown): ExtractionResult["reason"] {
  if (!isRecord(value)) return "response-incomplete-other";
  if (value.reason === "max_output_tokens") return "response-incomplete-max-output-tokens";
  if (value.reason === "content_filter") return "response-incomplete-content-filter";
  return "response-incomplete-other";
}

export function extractInventoryNutritionAiOutputText(responseBody: unknown): ExtractionResult {
  if (!isRecord(responseBody)) {
    return { status: "invalid-ai-response", reason: "response-not-object" };
  }

  const root = responseBody as OpenAiResponseObject;
  if (root.error !== undefined && root.error !== null) {
    return { status: "provider-error", reason: "response-error" };
  }

  if (root.status === "incomplete") {
    return { status: "invalid-ai-response", reason: getIncompleteReason(root.incomplete_details) };
  }

  if (root.status !== "completed") {
    return { status: "invalid-ai-response", reason: "response-status" };
  }

  const rootOutputText = getNonEmptyString(root.output_text);
  if (rootOutputText) return { status: "success", text: rootOutputText };

  if (!Array.isArray(root.output)) {
    return { status: "invalid-ai-response", reason: "response-output-missing" };
  }

  for (const outputItem of root.output) {
    if (!isRecord(outputItem) || outputItem.type !== "message" || !Array.isArray(outputItem.content)) continue;

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) continue;
      if (contentItem.type === "refusal") {
        return { status: "invalid-ai-response", reason: "response-refusal" };
      }
      if (contentItem.type === "output_text") {
        const text = getNonEmptyString(contentItem.text);
        if (text) return { status: "success", text };
      }
    }
  }

  return { status: "invalid-ai-response", reason: "response-output-missing" };
}

function parseInventoryNutritionAiResponse(
  input: InventoryNutritionAiInput,
  responseBody: unknown,
): InventoryNutritionProviderResult {
  const extracted = extractInventoryNutritionAiOutputText(responseBody);

  if (extracted.status === "provider-error") {
    console.warn("inventory_nutrition_ai_response_rejected", { reason: extracted.reason });
    return { status: "error", code: "provider-error" };
  }

  if (extracted.status === "invalid-ai-response") {
    console.warn("inventory_nutrition_ai_response_rejected", { reason: extracted.reason });
    return { status: "error", code: "invalid-ai-response" };
  }

  try {
    const parsedJson = JSON.parse(extracted.text) as unknown;
    const validated = validateInventoryNutritionAiOutput(input, parsedJson);
    if (validated.status === "invalid") {
      console.warn("inventory_nutrition_ai_response_rejected", { reason: `validation-${validated.reason}` });
      return { status: "error", code: "invalid-ai-response" };
    }
    return validated;
  } catch {
    console.warn("inventory_nutrition_ai_response_rejected", { reason: "invalid-json" });
    return { status: "error", code: "invalid-ai-response" };
  }
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

export async function estimateInventoryNutritionWithOpenAi(
  input: InventoryNutritionAiInput,
  options: {
    apiKey: string;
    model?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<InventoryNutritionProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INVENTORY_NUTRITION_AI_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? INVENTORY_NUTRITION_AI_MODEL_DEFAULT,
        input: [
          { role: "system", content: INVENTORY_NUTRITION_AI_SYSTEM_PROMPT },
          { role: "user", content: buildInventoryNutritionAiInputText(input) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "inventory_nutrition_estimate",
            strict: true,
            schema: INVENTORY_NUTRITION_AI_JSON_SCHEMA,
          },
        },
        store: false,
        max_output_tokens: INVENTORY_NUTRITION_AI_MAX_OUTPUT_TOKENS,
        reasoning: { effort: "none" },
      }),
      signal: controller.signal,
    });

    if (response.status === 408) return { status: "error", code: "timeout" };
    if (response.status === 429) return { status: "error", code: "rate-limited" };
    if (!response.ok) return { status: "error", code: "provider-error" };

    const responseBody = await response.json() as unknown;
    return parseInventoryNutritionAiResponse(input, responseBody);
  } catch (error) {
    if (isAbortError(error)) return { status: "error", code: "timeout" };
    return { status: "error", code: "provider-error" };
  } finally {
    clearTimeout(timeoutId);
  }
}
