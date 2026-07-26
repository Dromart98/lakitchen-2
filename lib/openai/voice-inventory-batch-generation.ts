import { INVENTORY_NUTRITION_AI_SYSTEM_PROMPT } from "@/lib/openai/inventory-nutrition";
import { buildInventoryDefaultRawFoodPromptInstruction } from "@/modules/inventory/inventory-default-raw-prompt";
import { validateInventoryNutritionAiOutput } from "@/modules/inventory/inventory-ai-nutrition";
import { detectVoiceInventoryLocationEvidence, reconcileVoiceInventoryDraftLocation } from "@/modules/inventory/voice-inventory-location-sections";
import { VoiceInventoryBatchOutputSchema, VoiceInventoryBatchRootSchema, VOICE_INVENTORY_BATCH_MAX_ITEMS, type VoiceInventoryBatchResult, withDraftClientIds, getVoiceInventoryDraftStatus, recoverVoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";

const endpoint = "https://api.openai.com/v1/responses";
export const VOICE_INVENTORY_BATCH_JSON_SCHEMA = { type: "object", properties: { items: { type: "array", minItems: 1, maxItems: VOICE_INVENTORY_BATCH_MAX_ITEMS, items: { type: "object", properties: { name: { type: "string" }, quantity: { anyOf: [{ type: "number" }, { type: "null" }] }, unit: { anyOf: [{ type: "string", enum: ["g", "kg", "ml", "l", "ud"] }, { type: "null" }] }, location: { anyOf: [{ type: "string", enum: ["pantry", "fridge", "freezer"] }, { type: "null" }] }, category: { anyOf: [{ type: "string", enum: ["protein", "carbohydrate", "vegetable", "fruit", "fat", "dairy", "legume", "condiment", "beverage", "other"] }, { type: "null" }] }, food_state: { type: "string", enum: ["raw", "cooked", "processed", "not_applicable", "unknown"] }, nutrition_basis: { anyOf: [{ type: "string", enum: ["per_100g", "per_100ml", "per_unit"] }, { type: "null" }] }, calories: { anyOf: [{ type: "number" }, { type: "null" }] }, protein_g: { anyOf: [{ type: "number" }, { type: "null" }] }, carbs_g: { anyOf: [{ type: "number" }, { type: "null" }] }, fat_g: { anyOf: [{ type: "number" }, { type: "null" }] }, confidence: { type: "string", enum: ["high", "medium", "low"] }, nutrition_assumptions: { type: "string" }, package_count: { anyOf: [{ type: "number" }, { type: "null" }] }, package_size: { anyOf: [{ type: "number" }, { type: "null" }] }, package_size_unit: { anyOf: [{ type: "string", enum: ["g", "kg", "ml", "l"] }, { type: "null" }] }, total_size: { anyOf: [{ type: "number" }, { type: "null" }] }, total_size_unit: { anyOf: [{ type: "string", enum: ["g", "kg", "ml", "l"] }, { type: "null" }] }, issues: { type: "array", items: { type: "string", enum: ["quantity-missing", "unit-missing", "location-unconfirmed", "package-size-missing", "nutrition-incomplete", "low-confidence", "ambiguous-product"] } } }, required: ["name", "quantity", "unit", "location", "category", "food_state", "nutrition_basis", "calories", "protein_g", "carbs_g", "fat_g", "confidence", "nutrition_assumptions", "package_count", "package_size", "package_size_unit", "total_size", "total_size_unit", "issues"], additionalProperties: false } } }, required: ["items"], additionalProperties: false } as const;
const prompt = `${INVENTORY_NUTRITION_AI_SYSTEM_PROMPT}\n\n${buildInventoryDefaultRawFoodPromptInstruction()}\n\nExtrae una lista de inventario en español y estima la nutrición de cada alimento identificable aplicando exactamente las reglas anteriores. Devuelve hasta 30 elementos en el mismo orden. gramos/kg usan per_100g, ml/l per_100ml y ud solo para unidades reales. Las macros son por la base, nunca por el total de inventario. despensa=pantry, nevera/refrigerador/frigorífico=fridge, congelador=freezer. Cuando el usuario introduzca una sección como «en la nevera tengo…», «congelador: …» o «en la despensa hay…», aplica esa ubicación a todos los productos siguientes hasta que aparezca otra sección; una ubicación explícita de un producto prevalece sobre la heredada. Si no se indica ubicación, añade location-unconfirmed. Limítate a extraer hechos: para N envases (latas, botellas, paquetes, bolsas, cajas o botes) usa package_count=N y quantity=N, unit=ud. No uses metadatos de envase para alimentos naturalmente contables como manzanas o huevos. Si se expresa tamaño individual, rellena package_size y package_size_unit; si se expresa un total, rellena total_size y total_size_unit. No multipliques, dividas ni conviertas: deja esa aritmética al código. Para esos productos devuelve la nutrición base por 100 g o 100 ml, nunca calculada por unidad. Usa null en todo metadato no expresado. Para envases sin peso o volumen explícito, no inventes su tamaño ni su nutrición: añade package-size-missing y nutrition-incomplete. Para cantidades simples como 500 g de arroz, conserva quantity=500 y unit=g y deja todos los metadatos de envase en null. Para un alimento ambiguo o que necesita aclaración deja todos los valores nutricionales null, explica el motivo en nutrition_assumptions y añade ambiguous-product y nutrition-incomplete. Para una estimación, nutrition_assumptions debe indicar brevemente que son valores típicos por la base. No sustituyas valores nutricionales explícitamente dictados.`;
type ExtractionResult =
  | { status: "success"; text: string }
  | { status: "provider-error" }
  | { status: "invalid-ai-response" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Extracts either Responses API output_text representation without exposing it. */
export function extractVoiceInventoryBatchOutputText(body: unknown): ExtractionResult {
  if (!isRecord(body)) return { status: "invalid-ai-response" };
  if (body.error !== undefined && body.error !== null) return { status: "provider-error" };
  if (body.status !== "completed") return { status: "invalid-ai-response" };

  const rootText = nonEmptyString(body.output_text);
  if (rootText) return { status: "success", text: rootText };
  if (!Array.isArray(body.output)) return { status: "invalid-ai-response" };

  for (const output of body.output) {
    if (!isRecord(output) || output.type !== "message" || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (!isRecord(content)) continue;
      if (content.type === "refusal") return { status: "invalid-ai-response" };
      if (content.type === "output_text") {
        const text = nonEmptyString(content.text);
        if (text) return { status: "success", text };
      }
    }
  }
  return { status: "invalid-ai-response" };
}

/**
 * Resolves nutrition without changing the facts extracted for the product.
 * Nutrition is inferred data, so an invalid estimate becomes an editable,
 * incomplete draft instead of invalidating the observed product or its peers.
 */
function resolveItemNutrition(item: (typeof VoiceInventoryBatchOutputSchema)["_output"]["items"][number]) {
  const nutritionValues = [item.nutrition_basis, item.calories, item.protein_g, item.carbs_g, item.fat_g];
  if (nutritionValues.every((value) => value === null)) return item;

  const nutritionUnit = item.package_size_unit ?? item.total_size_unit ?? item.unit;
  const incomplete = (foodStateRejected = false) => ({
    ...item,
    ...(foodStateRejected ? { food_state: "unknown" as const } : {}),
    nutrition_basis: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    issues: [...new Set([...item.issues, "nutrition-incomplete" as const])],
  });
  if (nutritionUnit === null || item.nutrition_basis === null) return incomplete();

  const result = validateInventoryNutritionAiOutput(
    { name: item.name, quantity: item.package_size ?? item.total_size ?? item.quantity, unit: nutritionUnit, category: item.category },
    {
      status: item.calories === null || item.protein_g === null || item.carbs_g === null || item.fat_g === null ? "needs_clarification" : "estimated",
      nutrition_basis: item.nutrition_basis,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      confidence: item.confidence,
      food_state: item.food_state,
      normalized_food_name: item.name,
      assumptions: item.nutrition_assumptions,
      clarification: item.calories === null ? item.nutrition_assumptions : null,
    },
  );
  if (result.status !== "success") return incomplete(result.status === "invalid" && result.reason === "food-state");

  return {
    ...item,
    nutrition_basis: result.estimate.nutrition_basis,
    calories: result.estimate.calories,
    protein_g: result.estimate.protein_g,
    carbs_g: result.estimate.carbs_g,
    fat_g: result.estimate.fat_g,
    confidence: result.estimate.confidence,
    nutrition_assumptions: result.estimate.assumptions,
  };
}

export async function generateVoiceInventoryBatch(text: string, options: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): Promise<VoiceInventoryBatchResult> {
 const locationEvidence = detectVoiceInventoryLocationEvidence(text);
 const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
 try { const response = await (options.fetchImpl ?? fetch)(endpoint, { method: "POST", headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: options.model ?? "gpt-5.6-terra", input: [{ role: "system", content: prompt }, { role: "user", content: text }], text: { format: { type: "json_schema", name: "voice_inventory_batch", strict: true, schema: VOICE_INVENTORY_BATCH_JSON_SCHEMA } }, store: false, max_output_tokens: 5000, reasoning: { effort: "low" } }), signal: controller.signal });
 if (response.status === 408) return { status: "error", code: "timeout", message: "El análisis está tardando demasiado. Inténtalo de nuevo." }; if (response.status === 429) return { status: "error", code: "rate-limited", message: "Hay demasiadas solicitudes. Inténtalo de nuevo más tarde." }; if (!response.ok) return { status: "error", code: "provider-error", message: "No se pudo analizar la lista. Inténtalo de nuevo." };
 const extracted = extractVoiceInventoryBatchOutputText(await response.json());
 if (extracted.status === "provider-error") return { status: "error", code: "provider-error", message: "No se pudo analizar la lista. Inténtalo de nuevo." };
 if (extracted.status !== "success") return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." };
 const raw = extracted.text;
 if (!raw) return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." }; let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." }; }
 const root = VoiceInventoryBatchRootSchema.safeParse(parsed); if (!root.success) return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." };
 if (root.data.items.length > VOICE_INVENTORY_BATCH_MAX_ITEMS) return { status: "error", code: "too-many-products", message: "Se detectaron demasiados productos." };
 const recoveredItems = root.data.items.map(recoverVoiceInventoryDraftItem).filter((item) => item !== null);
 if (recoveredItems.length === 0) return { status: "error", code: "invalid-ai-response", message: "No se identificó ningún producto revisable." };
 const locationItems = recoveredItems.map((item) => reconcileVoiceInventoryDraftLocation(item, locationEvidence));
 const nutritionItems = locationItems.map(resolveItemNutrition);
 const items = withDraftClientIds(nutritionItems); return items.some((item) => getVoiceInventoryDraftStatus(item) !== "Listo") ? { status: "needs-clarification", items, message: "Revisa los productos marcados antes de la próxima fase." } : { status: "success", items };
 } catch (error) { return { status: "error", code: error instanceof Error && error.name === "AbortError" ? "timeout" : "provider-error", message: "No se pudo analizar la lista. Inténtalo de nuevo." }; } finally { clearTimeout(timer); }
}
