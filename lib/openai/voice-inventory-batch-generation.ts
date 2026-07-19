import { VoiceInventoryBatchOutputSchema, VOICE_INVENTORY_BATCH_MAX_ITEMS, type VoiceInventoryBatchResult, withDraftClientIds, getVoiceInventoryDraftStatus } from "@/modules/inventory/voice-inventory-batch";

const endpoint = "https://api.openai.com/v1/responses";
export const VOICE_INVENTORY_BATCH_JSON_SCHEMA = { type: "object", properties: { items: { type: "array", minItems: 1, maxItems: VOICE_INVENTORY_BATCH_MAX_ITEMS, items: { type: "object", properties: { name: { type: "string" }, quantity: { anyOf: [{ type: "number" }, { type: "null" }] }, unit: { anyOf: [{ type: "string", enum: ["g", "kg", "ml", "l", "ud"] }, { type: "null" }] }, location: { anyOf: [{ type: "string", enum: ["pantry", "fridge", "freezer"] }, { type: "null" }] }, category: { anyOf: [{ type: "string", enum: ["protein", "carbohydrate", "vegetable", "fruit", "fat", "dairy", "legume", "condiment", "beverage", "other"] }, { type: "null" }] }, food_state: { type: "string", enum: ["raw", "cooked", "processed", "unknown"] }, nutrition_basis: { anyOf: [{ type: "string", enum: ["per_100g", "per_100ml", "per_unit"] }, { type: "null" }] }, calories: { anyOf: [{ type: "number" }, { type: "null" }] }, protein_g: { anyOf: [{ type: "number" }, { type: "null" }] }, carbs_g: { anyOf: [{ type: "number" }, { type: "null" }] }, fat_g: { anyOf: [{ type: "number" }, { type: "null" }] }, confidence: { type: "string", enum: ["high", "medium", "low"] }, issues: { type: "array", items: { type: "string", enum: ["quantity-missing", "unit-missing", "location-unconfirmed", "package-size-missing", "nutrition-incomplete", "low-confidence", "ambiguous-product"] } } }, required: ["name", "quantity", "unit", "location", "category", "food_state", "nutrition_basis", "calories", "protein_g", "carbs_g", "fat_g", "confidence", "issues"], additionalProperties: false } } }, required: ["items"], additionalProperties: false } as const;
const prompt = `Extrae una lista de compra de inventario en español. Devuelve cada alimento, sin inventar datos. gramos/kg usan per_100g, ml/l per_100ml, y ud solo para unidades reales. Las macros son por base, nunca por el total. despensa=pantry, nevera/refrigerador/frigorífico=fridge, congelador=freezer. Si no se indica ubicación, añade location-unconfirmed. Dos paquetes, bolsa, caja, bote o manojo sin peso: conserva el nombre, cantidad y unidad null y añade package-size-missing. Marca nutrition-incomplete si faltan macros; low-confidence si confianza baja. Pollo/carne/pescado/arroz/pasta/legumbres/verduras/huevos: raw por defecto; latas, jamón y queso: processed.`;
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

export async function generateVoiceInventoryBatch(text: string, options: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): Promise<VoiceInventoryBatchResult> {
 const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
 try { const response = await (options.fetchImpl ?? fetch)(endpoint, { method: "POST", headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: options.model ?? "gpt-5.6-terra", input: [{ role: "system", content: prompt }, { role: "user", content: text }], text: { format: { type: "json_schema", name: "voice_inventory_batch", strict: true, schema: VOICE_INVENTORY_BATCH_JSON_SCHEMA } }, store: false, max_output_tokens: 5000, reasoning: { effort: "low" } }), signal: controller.signal });
 if (response.status === 408) return { status: "error", code: "timeout", message: "El análisis está tardando demasiado. Inténtalo de nuevo." }; if (response.status === 429) return { status: "error", code: "rate-limited", message: "Hay demasiadas solicitudes. Inténtalo de nuevo más tarde." }; if (!response.ok) return { status: "error", code: "provider-error", message: "No se pudo analizar la lista. Inténtalo de nuevo." };
 const extracted = extractVoiceInventoryBatchOutputText(await response.json());
 if (extracted.status === "provider-error") return { status: "error", code: "provider-error", message: "No se pudo analizar la lista. Inténtalo de nuevo." };
 if (extracted.status !== "success") return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." };
 const raw = extracted.text;
 if (!raw) return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." }; let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." }; } const validated = VoiceInventoryBatchOutputSchema.safeParse(parsed); if (!validated.success) return { status: "error", code: "invalid-ai-response", message: "No se pudo obtener una lista válida." }; if (validated.data.items.length > VOICE_INVENTORY_BATCH_MAX_ITEMS) return { status: "error", code: "too-many-products", message: "Se detectaron demasiados productos." }; const items = withDraftClientIds(validated.data.items); return items.some((item) => getVoiceInventoryDraftStatus(item) !== "Listo") ? { status: "needs-clarification", items, message: "Revisa los productos marcados antes de la próxima fase." } : { status: "success", items };
 } catch (error) { return { status: "error", code: error instanceof Error && error.name === "AbortError" ? "timeout" : "provider-error", message: "No se pudo analizar la lista. Inténtalo de nuevo." }; } finally { clearTimeout(timer); }
}
