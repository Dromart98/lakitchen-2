import {
  buildInventoryNutritionAiInputText,
  INVENTORY_NUTRITION_AI_MAX_OUTPUT_TOKENS,
  INVENTORY_NUTRITION_AI_MODEL_DEFAULT,
  INVENTORY_NUTRITION_AI_TIMEOUT_MS,
  InventoryNutritionAiOutputSchema,
  validateInventoryNutritionAiOutput,
  type InventoryNutritionAiEstimate,
  type InventoryNutritionAiInput,
} from "@/modules/inventory/inventory-ai-nutrition";

export type InventoryNutritionProviderResult =
  | { status: "success"; estimate: InventoryNutritionAiEstimate }
  | { status: "needs-clarification"; message: string }
  | { status: "error"; code: "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response" };

type ParsedResponsesClient = {
  responses: {
    parse: (body: {
      model: string;
      input: Array<{ role: "system" | "user"; content: string }>;
      text: { format: unknown };
      store: false;
      max_output_tokens: number;
      reasoning?: { effort: "low" };
    }, options?: { timeout?: number; maxRetries?: number }) => Promise<{ output_parsed?: unknown }>;
  };
};

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

export async function createInventoryNutritionOpenAiClient(apiKey: string): Promise<ParsedResponsesClient> {
  // @ts-expect-error The official SDK is installed in package.json; this dynamic import keeps tests mockable.
  const openAiModule = await import("openai");
  const OpenAI = openAiModule.default;
  return new OpenAI({ apiKey, timeout: INVENTORY_NUTRITION_AI_TIMEOUT_MS, maxRetries: 1 });
}

type InventoryNutritionProviderErrorCode = "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response";

function getSafeOpenAiErrorCode(error: unknown): InventoryNutritionProviderErrorCode {
  if (typeof error === "object" && error !== null) {
    const maybeStatus = "status" in error ? Number((error as { status?: unknown }).status) : null;
    const maybeCode = "code" in error ? String((error as { code?: unknown }).code) : "";
    const maybeName = "name" in error ? String((error as { name?: unknown }).name) : "";

    if (maybeStatus === 429) return "rate-limited";
    if (maybeCode === "ETIMEDOUT" || maybeCode === "AbortError" || maybeName === "TimeoutError" || maybeStatus === 408) return "timeout";
  }

  return "provider-error";
}

async function getInventoryNutritionAiZodTextFormat() {
  // @ts-expect-error The official SDK helper is provided by the openai package.
  const helperModule = await import("openai/helpers/zod");
  return helperModule.zodTextFormat(InventoryNutritionAiOutputSchema, "inventory_nutrition_estimate");
}

export async function estimateInventoryNutritionWithOpenAi(
  input: InventoryNutritionAiInput,
  options: {
    client: ParsedResponsesClient;
    model?: string;
  },
): Promise<InventoryNutritionProviderResult> {
  try {
    const response = await options.client.responses.parse({
      model: options.model ?? INVENTORY_NUTRITION_AI_MODEL_DEFAULT,
      input: [
        { role: "system", content: INVENTORY_NUTRITION_AI_SYSTEM_PROMPT },
        { role: "user", content: buildInventoryNutritionAiInputText(input) },
      ],
      text: {
        format: await getInventoryNutritionAiZodTextFormat(),
      },
      store: false,
      max_output_tokens: INVENTORY_NUTRITION_AI_MAX_OUTPUT_TOKENS,
      reasoning: { effort: "low" },
    }, { timeout: INVENTORY_NUTRITION_AI_TIMEOUT_MS, maxRetries: 0 });

    const validated = validateInventoryNutritionAiOutput(input, response.output_parsed);
    if (validated.status === "invalid") return { status: "error", code: "invalid-ai-response" };
    return validated;
  } catch (error) {
    return { status: "error", code: getSafeOpenAiErrorCode(error) };
  }
}
