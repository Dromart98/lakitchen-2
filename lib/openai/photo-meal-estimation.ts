import { TEXT_MEAL_JSON_SCHEMA, validateTextMealProviderOutput, type TextMealEstimationResult } from "@/modules/meals/text-meal-ai";

const ENDPOINT = "https://api.openai.com/v1/responses";
export const PHOTO_MEAL_AI_MODEL_DEFAULT = "gpt-5.6-terra";
export const PHOTO_MEAL_SYSTEM_PROMPT = `Realiza una estimación nutricional orientativa de la fotografía de comida; no es una medición exacta. Analiza una fotografía clara de un único plato aunque no haya báscula, diámetro conocido ni otra escala exacta. Identifica los alimentos principales razonablemente visibles y mantenlos como ingredientes separados. Cada ingrediente debe usar normalized_name (nombre alimentario simple y normalizado), display_name (texto claro para la persona), name (igual a display_name para compatibilidad), cantidad, unidad, preparación, confianza individual y macros: por ejemplo, un plato claro de “arroz con pollo” debe producir arroz cocido y pollo cocinado como dos ingredientes independientes, nunca el plato general como único ingrediente. Debe producir una estimación prudente para pollo y otra para arroz, no needs-clarification solo por no conocer sus gramos exactos.

Para estimar porciones visuales, usa con prudencia la proporción que ocupa cada alimento en el plato, el número y tamaño aproximado de las piezas, el volumen relativo, una porción doméstica habitual y la comparación entre componentes visibles. Declara en assumptions cada peso o cantidad estimado visualmente y que es una aproximación, nunca una medición. Usa la confianza de cada ingrediente y la confianza global: high solo cuando haya una cantidad fiable explícita y evidencia visual coherente; usa medium o low para porciones estimadas visualmente sin peso conocido. Prefiere una estimación prudente de confianza medium o low a pedir una aclaración innecesaria.

Usa needs-clarification únicamente si la fotografía es realmente inutilizable o ambigua: comida irreconocible por desenfoque, oscuridad u obstrucción; no contiene comida; hay varios platos sin saber cuál analizar; los componentes principales están ocultos; existen alternativas nutricionalmente muy distintas imposibles de distinguir; no se identifica ningún alimento con confianza mínima; o el texto adicional contradice claramente la imagen. Una fotografía clara de un plato único con alimentos reconocibles debe devolver success incluso sin contexto adicional.

La preparación visible tiene prioridad: un plato servido listo para comer puede considerarse cocinado cuando su apariencia lo respalda. Marca pollo dorado, asado o a la plancha como cocinado (o la preparación visible más concreta) y arroz servido como cocido normalmente. Si no está totalmente claro, declara esa suposición. No copies automáticamente una política de crudo.

El texto adicional sirve de contexto útil. Una cantidad explícita y razonable del usuario prevalece para ese ingrediente cuando sea coherente con la imagen; úsala junto con la imagen, sin ignorar alimentos visibles que no estén mencionados. No inventes alimentos del texto sin relación visible. Si se indica aceite, salsa u otro ingrediente y es coherente, puedes incluirlo; no añadas por defecto aceite, mantequilla, salsas, mayonesa, aderezos, ingredientes internos, sal o especias que no sean visibles ni estén indicados. Si la cocción podría llevar aceite pero no hay evidencia, no lo incluyas y puedes declararlo como no contabilizado en assumptions.

Las unidades permitidas son: g, ml, unidad, unidades, loncha, lonchas, cucharadita, cucharaditas, cucharada, cucharadas, taza, tazas, lata, latas, plato y platos. No des consejos médicos, no afirmes exactitud ni que la comida se ha registrado. Si status es success, message debe ser null. Si status es needs-clarification, suggested_name, ingredients, assumptions y confidence deben ser null. Devuelve exclusivamente JSON conforme al esquema.`;

export const PHOTO_MEAL_PROVIDER_CONTRACT = {
  // Increment when request shaping or output normalization/validation semantics change.
  processingVersion: 1,
  endpoint: ENDPOINT,
  systemPrompt: PHOTO_MEAL_SYSTEM_PROMPT,
  defaultContext: "Analiza esta fotografía de comida.",
  imageDetail: "high",
  responseFormat: { type: "json_schema", name: "photo_meal_estimation", strict: true, schema: TEXT_MEAL_JSON_SCHEMA },
  store: false,
  reasoning: { effort: "low" },
  maxOutputTokens: 2500,
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extract(value: unknown): string | null {
  if (!record(value) || value.status !== "completed") return null;
  if (typeof value.output_text === "string" && value.output_text.trim()) return value.output_text;
  if (!Array.isArray(value.output)) return null;
  for (const item of value.output) {
    if (!record(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (record(content) && content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

// Structured Outputs guarantees the declared field types, but the shared flat
// schema cannot express status-dependent nullability without an unsupported
// root-level union. Discard only fields that are irrelevant for the selected
// status, then run the existing strict nutrition validator unchanged.
export function normalizePhotoMealProviderOutput(value: unknown): unknown {
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

export async function estimatePhotoMealWithOpenAi(
  imageDataUrl: string,
  context: string,
  options: { apiKey: string; model?: string; fetchImpl?: typeof fetch },
): Promise<TextMealEstimationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(PHOTO_MEAL_PROVIDER_CONTRACT.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? PHOTO_MEAL_AI_MODEL_DEFAULT,
        input: [
          { role: "system", content: PHOTO_MEAL_PROVIDER_CONTRACT.systemPrompt },
          {
            role: "user",
            content: [
              { type: "input_text", text: context || PHOTO_MEAL_PROVIDER_CONTRACT.defaultContext },
              { type: "input_image", image_url: imageDataUrl, detail: PHOTO_MEAL_PROVIDER_CONTRACT.imageDetail },
            ],
          },
        ],
        text: {
          format: {
            ...PHOTO_MEAL_PROVIDER_CONTRACT.responseFormat,
          },
        },
        store: PHOTO_MEAL_PROVIDER_CONTRACT.store,
        reasoning: PHOTO_MEAL_PROVIDER_CONTRACT.reasoning,
        max_output_tokens: PHOTO_MEAL_PROVIDER_CONTRACT.maxOutputTokens,
      }),
      signal: controller.signal,
    });
    if (response.status === 408) return { status: "error", code: "provider-timeout" };
    if (!response.ok) return { status: "error", code: "provider-error" };
    const output = extract(await response.json());
    if (!output) return { status: "error", code: "invalid-ai-response" };
    try {
      return validateTextMealProviderOutput(normalizePhotoMealProviderOutput(JSON.parse(output)));
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
