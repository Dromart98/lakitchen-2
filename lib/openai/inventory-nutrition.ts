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
Si el nombre es demasiado ambiguo, devuelve status needs_clarification y deja los campos nutricionales en null.
Si hay varias versiones razonables, usa una estimación típica y marca confidence low.
Escribe assumptions y clarification en español.
No afirmes que la estimación procede de una etiqueta, base de datos o fuente verificada.
No incluyas explicaciones fuera del esquema estructurado.`;

type OpenAiResponseObject = {
  status?: unknown;
  error?: unknown;
  output?: unknown;
  output_text?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function extractInventoryNutritionAiOutputText(responseBody: unknown):
  | { status: "success"; text: string }
  | { status: "provider-error" }
  | { status: "invalid-ai-response" } {
  if (!isRecord(responseBody)) return { status: "invalid-ai-response" };

  const root = responseBody as OpenAiResponseObject;
  if (root.error !== undefined && root.error !== null) return { status: "provider-error" };
  if (root.status === "incomplete") return { status: "invalid-ai-response" };
  if (root.status !== "completed") return { status: "invalid-ai-response" };

  const rootOutputText = getNonEmptyString(root.output_text);
  if (rootOutputText) return { status: "success", text: rootOutputText };

  if (!Array.isArray(root.output)) return { status: "invalid-ai-response" };

  for (const outputItem of root.output) {
    if (!isRecord(outputItem) || outputItem.type !== "message" || !Array.isArray(outputItem.content)) continue;

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) continue;
      if (contentItem.type === "refusal") return { status: "invalid-ai-response" };
      if (contentItem.type === "output_text") {
        const text = getNonEmptyString(contentItem.text);
        if (text) return { status: "success", text };
      }
    }
  }

  return { status: "invalid-ai-response" };
}

function parseInventoryNutritionAiResponse(
  input: InventoryNutritionAiInput,
  responseBody: unknown,
): InventoryNutritionProviderResult {
  const extracted = extractInventoryNutritionAiOutputText(responseBody);

  if (extracted.status === "provider-error") return { status: "error", code: "provider-error" };
  if (extracted.status === "invalid-ai-response") return { status: "error", code: "invalid-ai-response" };

  try {
    const parsedJson = JSON.parse(extracted.text) as unknown;
    const validated = validateInventoryNutritionAiOutput(input, parsedJson);
    if (validated.status === "invalid") return { status: "error", code: "invalid-ai-response" };
    return validated;
  } catch {
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
