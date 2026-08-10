import { createLogger } from "@/lib/server/logger";
import {
  buildRecipeAiInputText,
  RECIPE_AI_JSON_SCHEMA,
  RECIPE_AI_MAX_OUTPUT_TOKENS,
  RECIPE_AI_MODEL_DEFAULT,
  RECIPE_AI_TIMEOUT_MS,
  validateRecipeAiProviderOutput,
  type RecipeAiExpirationContext,
  type RecipeAiGenerationResult,
  type RecipeAiInventoryItem,
  type RecipeAiRequest,
} from "@/modules/recipes/recipe-ai-generation";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export const RECIPE_AI_SYSTEM_PROMPT = `Genera sugerencias temporales de recetas en español usando exclusivamente los productos de inventario enviados.
No inventes ingredientes externos, no cambies unidades y no superes cantidades disponibles.
Devuelve solo JSON conforme al esquema. Si no puedes proponer recetas seguras, devuelve needs-clarification con un mensaje breve en español.
No incluyas macros, no afirmes que se ha guardado nada y no incluyas HTML.
Si priority_mode es balanced, mantén el comportamiento normal sin exigir productos próximos a caducar.
Si priority_mode es expiration, expiration_context.today_key es la fecha de referencia autoritativa calculada por el servidor y expiration_context.urgent_inventory_item_ids contiene exactamente los productos que el servidor considera urgentes. Prioriza exclusivamente esos IDs como productos próximos a caducar, sin recalcular ni reinterpretar la urgencia con otra fecha. Al menos una receta devuelta debe incluir un ID urgente y, si solo se pide una sugerencia, esa receta debe incluirlo. Usa únicamente el inventario real, mantén nombres y unidades exactos, no excedas cantidades disponibles y no generes macros.`;

type OpenAiResponseObject = {
  status?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  output?: unknown;
  output_text?: unknown;
};

type ExtractionResult =
  | { status: "success"; text: string }
  | { status: "provider-error" }
  | { status: "incomplete-response" }
  | { status: "refusal" }
  | { status: "invalid-ai-response" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function extractRecipeAiOutputText(responseBody: unknown): ExtractionResult {
  if (!isRecord(responseBody)) return { status: "invalid-ai-response" };

  const root = responseBody as OpenAiResponseObject;
  if (root.error !== undefined && root.error !== null) return { status: "provider-error" };
  if (root.status === "incomplete") return { status: "incomplete-response" };
  if (root.status !== "completed") return { status: "invalid-ai-response" };

  const rootOutputText = getNonEmptyString(root.output_text);
  if (rootOutputText) return { status: "success", text: rootOutputText };

  if (!Array.isArray(root.output)) return { status: "invalid-ai-response" };

  for (const outputItem of root.output) {
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

function parseRecipeAiResponse(
  request: RecipeAiRequest,
  inventoryItems: RecipeAiInventoryItem[],
  responseBody: unknown,
  urgentInventoryItemIds: ReadonlySet<string> = new Set(),
): RecipeAiGenerationResult {
  const extracted = extractRecipeAiOutputText(responseBody);
  if (extracted.status !== "success") {
    const code = extracted.status === "provider-error" ? "provider-error" : extracted.status;
    createLogger("ai", "recipe_generation").warn("provider_response_rejected", { reason: code });
    return { status: "error", code };
  }

  try {
    const parsedJson = JSON.parse(extracted.text) as unknown;
    return validateRecipeAiProviderOutput(request, inventoryItems, parsedJson, urgentInventoryItemIds);
  } catch {
    createLogger("ai", "recipe_generation").warn("provider_response_rejected", { reason: "invalid-json" });
    return { status: "error", code: "invalid-json" };
  }
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

export async function generateRecipesWithOpenAi(
  request: RecipeAiRequest,
  inventoryItems: RecipeAiInventoryItem[],
  options: {
    apiKey: string;
    model?: string;
    fetchImpl?: typeof fetch;
    expirationContext?: RecipeAiExpirationContext;
  },
): Promise<RecipeAiGenerationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECIPE_AI_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? RECIPE_AI_MODEL_DEFAULT,
        input: [
          { role: "system", content: RECIPE_AI_SYSTEM_PROMPT },
          { role: "user", content: buildRecipeAiInputText(request, inventoryItems, options.expirationContext) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "recipe_suggestions",
            strict: true,
            schema: RECIPE_AI_JSON_SCHEMA,
          },
        },
        store: false,
        max_output_tokens: RECIPE_AI_MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low" },
      }),
      signal: controller.signal,
    });

    if (response.status === 408) return { status: "error", code: "http-timeout" };
    if (response.status === 429) return { status: "error", code: "rate-limited" };
    if (response.status >= 500) return { status: "error", code: "provider-error" };
    if (!response.ok) return { status: "error", code: "provider-error" };

    const responseBody = await response.json() as unknown;
    return parseRecipeAiResponse(
      request,
      inventoryItems,
      responseBody,
      options.expirationContext?.urgentInventoryItemIds,
    );
  } catch (error) {
    if (isAbortError(error)) return { status: "error", code: "timeout" };
    return { status: "error", code: "network-error" };
  } finally {
    clearTimeout(timeoutId);
  }
}
