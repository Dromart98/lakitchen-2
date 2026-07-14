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
Diferencia siempre entre alimento crudo, cocinado, procesado, no aplicable y desconocido.
La cocción puede reducir el agua y aumentar la concentración de calorías y macros expresados por 100 g.
Nunca utilices valores de un alimento cocinado cuando el nombre indica explícitamente que está crudo.
Nunca utilices valores crudos cuando el nombre indica una preparación cocinada.
Para Pechuga de pollo cruda, utiliza una estimación típica de pechuga cruda, no de pechuga asada, hervida o a la plancha. Este ejemplo solo explica la diferencia de estado: no copies valores concretos ni apliques reglas específicas del pollo a otros alimentos.
Clasifica food_state como raw si es crudo o sin cocinar; cooked si está cocido, asado, hervido, horneado, frito o a la plancha; processed si es conserva, embutido, fiambre, precocinado o producto industrial transformado; not_applicable si el estado crudo/cocinado no es relevante; unknown si no hay información suficiente.
Las palabras fresco o fresca, por sí solas, no significan necesariamente que el alimento esté crudo. Productos como queso fresco, pasta fresca o leche fresca no deben clasificarse automáticamente como raw.
normalized_food_name debe ser breve y normalizado, sin inventar marca, ingredientes o preparación.
Si el estado modifica sustancialmente los valores y no puede deducirse de la entrada, devuelve status needs_clarification, food_state unknown, nutrition_basis null, calories null, protein_g null, carbs_g null, fat_g null y clarification explicando qué información falta.
Para una estimación correcta utiliza status estimated y clarification null.
Respeta la variante o expectativa detectada por la aplicación en el contexto del usuario.
Jamón sin más detalles representa por defecto un jamón curado tipo serrano genérico; no lo conviertas en ibérico, bellota ni en una marca concreta.
Jamón cocido y Jamón York son productos procesados diferentes del jamón serrano.
Queso sin más detalles representa un queso genérico.
Usa fresco, tierno, semicurado, curado, viejo, añejo, ahumado o azul para diferenciar el tipo de queso cuando aparezcan en la entrada o en la expectativa detectada.
Queso fresco no significa alimento crudo; queso fresco, semicurado y curado no deben mezclar sus valores.
No copies valores concretos de los ejemplos.
No inventes marca, receta, cantidad de aceite, salsa, método de cocción, peso por unidad, ingredientes no indicados, porcentaje de grasa ni tipo de leche.
No multipliques calorías ni macros por la cantidad del inventario.
Los valores deben representar: g o kg por 100 g; ml o l por 100 ml; ud por unidad.
Utiliza la categoría únicamente como contexto.
La confidence representa cuánto se ha identificado correctamente el alimento, su estado, la base nutricional y las suposiciones necesarias.
high: alimento habitual claramente identificado, estado explícito o no aplicable, sin marca concreta, sin preparación inventada, valores típicos estables y sin suposiciones importantes. Pechuga de pollo cruda puede ser high porque alimento y estado están expresamente indicados.
medium: alimento identificado con variaciones relevantes por variedad, marca o composición, pero puede estimarse razonablemente sin aclaración.
low: identificación con suposiciones importantes, variación elevada o estimación solo orientativa. Si la ambigüedad puede cambiar sustancialmente los macros, no devuelvas low: devuelve needs_clarification.
No utilices siempre low solo porque los valores sean estimaciones y no utilices siempre high.
Escribe assumptions y clarification en español.
No afirmes que la estimación procede de una etiqueta, base de datos o fuente verificada.
No incluyas explicaciones fuera del esquema estructurado.`

type OpenAiResponseObject = {
  status?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  output?: unknown;
  output_text?: unknown;
};

type InvalidExtractionReason =
  | "response-not-object"
  | "response-incomplete-max-output-tokens"
  | "response-incomplete-content-filter"
  | "response-incomplete-other"
  | "response-status"
  | "response-output-missing"
  | "response-refusal";

type ExtractionResult =
  | { status: "success"; text: string }
  | { status: "provider-error"; reason: "response-error" }
  | { status: "invalid-ai-response"; reason: InvalidExtractionReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getIncompleteReason(value: unknown): InvalidExtractionReason {
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
        reasoning: { effort: "low" },
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
