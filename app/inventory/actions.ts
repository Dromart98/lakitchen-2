"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { validateBarcodeInput } from "@/modules/barcodes/barcode";
import { createClient } from "@/lib/supabase/server";
import { validateOptionalInventoryCategory, type InventoryCategory } from "@/modules/inventory/inventory-categories";
import {
  hasInventoryNutritionValues,
  isInventoryNutritionBasis,
  parseOptionalInventoryNutritionNumber,
} from "@/modules/inventory/inventory-nutrition";
import { isMealType } from "@/modules/meals/meal-types";
import { estimateInventoryNutritionWithOpenAi } from "@/lib/openai/inventory-nutrition";
import { parseInventoryNutritionAiInput, type InventoryNutritionAiEstimate, type InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import { toVoiceInventoryBatchSaveInput } from "@/modules/inventory/voice-inventory-batch-save";

type InventoryLocation = "pantry" | "fridge" | "freezer";
type InventoryUnit = "ud" | "g" | "kg" | "ml" | "l";

const INVENTORY_PATH = "/inventory";
const inventoryLocations = ["pantry", "fridge", "freezer"] as const;
const inventoryUnits = ["ud", "g", "kg", "ml", "l"] as const;


export type InventoryNutritionAiActionResult =
  | { status: "success"; estimate: InventoryNutritionAiEstimate }
  | { status: "needs-clarification"; message: string }
  | {
      status: "error";
      code: "invalid-input" | "not-configured" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response";
      message: string;
    };

type InventoryNutritionAiErrorCode = "invalid-input" | "not-configured" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response";

const inventoryNutritionAiErrorMessages: Record<InventoryNutritionAiErrorCode, string> = {
  "invalid-input": "Completa un nombre y una unidad válidos antes de calcular.",
  "not-configured": "La estimación con IA no está configurada todavía.",
  timeout: "La estimación está tardando demasiado. Inténtalo de nuevo.",
  "rate-limited": "Hay demasiadas solicitudes en este momento. Inténtalo de nuevo en unos minutos.",
  "provider-error": "No se pudieron estimar los macros. Inténtalo de nuevo.",
  "invalid-ai-response": "No se pudo obtener una estimación nutricional válida.",
};

function inventoryNutritionAiError(code: keyof typeof inventoryNutritionAiErrorMessages): InventoryNutritionAiActionResult {
  return { status: "error", code, message: inventoryNutritionAiErrorMessages[code] };
}

export async function estimateInventoryNutritionAction(input: InventoryNutritionAiInput): Promise<InventoryNutritionAiActionResult> {
  const validatedInput = parseInventoryNutritionAiInput(input);
  if (!validatedInput) return inventoryNutritionAiError("invalid-input");

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "inventory nutrition AI estimate");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return inventoryNutritionAiError("not-configured");

  const result = await estimateInventoryNutritionWithOpenAi(validatedInput, {
    apiKey,
    model: process.env.OPENAI_INVENTORY_NUTRITION_MODEL || undefined,
  });

  if (result.status === "error") {
    console.warn("inventory_nutrition_ai_estimate_failed", { code: result.code });
    return inventoryNutritionAiError(result.code);
  }

  return result;
}

function isInventoryLocation(value: string): value is InventoryLocation {
  return inventoryLocations.includes(value as InventoryLocation);
}

function isInventoryUnit(value: string): value is InventoryUnit {
  return inventoryUnits.includes(value as InventoryUnit);
}


type BarcodeProductLookupResult =
  | { status: "invalid"; message: string }
  | { status: "found"; product: { barcode: string; name: string; default_quantity: number; default_unit: InventoryUnit; default_location: InventoryLocation | null; category: InventoryCategory | null; nutrition_basis?: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } }
  | { status: "unknown"; barcode: string; message: string }
  | { status: "error"; message: string };

export async function lookupBarcodeProductAction(rawBarcode: string): Promise<BarcodeProductLookupResult> {
  const validation = validateBarcodeInput(rawBarcode);

  if (!validation.ok) {
    return { status: "invalid", message: validation.message };
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "barcode product lookup");

  const { data, error } = await (supabase as any)
    .from("user_barcode_products")
    .select("barcode, name, default_quantity, default_unit, default_location, default_category, nutrition_basis, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .eq("barcode", validation.barcode)
    .maybeSingle() as {
      data: { barcode: string; name: string; default_quantity: number; default_unit: InventoryUnit; default_location: InventoryLocation | null; default_category: InventoryCategory | null; nutrition_basis?: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not look up the barcode product:", error.message);
    return { status: "error", message: "No se pudo buscar el código. Inténtalo de nuevo." };
  }

  if (!data) {
    return { status: "unknown", barcode: validation.barcode, message: "Este código no está guardado todavía. Completa los datos manualmente." };
  }

  return {
    status: "found",
    product: {
      barcode: data.barcode,
      name: data.name,
      default_quantity: data.default_quantity,
      default_unit: data.default_unit,
      default_location: data.default_location,
      category: data.default_category,
      nutrition_basis: data.nutrition_basis ?? undefined,
      calories: data.calories,
      protein_g: data.protein_g,
      carbs_g: data.carbs_g,
      fat_g: data.fat_g,
    },
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOptionalExpirationDate(formData: FormData) {
  const rawValue = String(formData.get("expires_at") ?? "").trim();

  if (!rawValue) return null;

  const parsedDate = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || rawValue !== parsedDate.toISOString().slice(0, 10)) {
    redirect(`${INVENTORY_PATH}?inventoryError=invalid-expires-at`);
  }

  return rawValue;
}

function getOptionalNutritionNumber(formData: FormData, field: string, errorCode: string) {
  const value = parseOptionalInventoryNutritionNumber(formData.get(field));

  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    redirect(`${INVENTORY_PATH}?inventoryError=${errorCode}`);
  }

  return value;
}

function getOptionalNutritionFields(formData: FormData) {
  const rawBasis = String(formData.get("nutrition_basis") ?? "").trim();
  const calories = getOptionalNutritionNumber(formData, "calories", "invalid-calories");
  const proteinG = getOptionalNutritionNumber(formData, "protein_g", "invalid-protein");
  const carbsG = getOptionalNutritionNumber(formData, "carbs_g", "invalid-carbs");
  const fatG = getOptionalNutritionNumber(formData, "fat_g", "invalid-fat");
  const hasNutritionValues = hasInventoryNutritionValues([calories, proteinG, carbsG, fatG]);

  if (!rawBasis) {
    if (hasNutritionValues) redirect(`${INVENTORY_PATH}?inventoryError=missing-nutrition-basis`);

    return { nutritionBasis: null, calories, proteinG, carbsG, fatG };
  }

  if (!isInventoryNutritionBasis(rawBasis)) {
    redirect(`${INVENTORY_PATH}?inventoryError=invalid-nutrition-basis`);
  }

  return { nutritionBasis: rawBasis, calories, proteinG, carbsG, fatG };
}

function getValidatedInventoryFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "");
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");
  const category = validateOptionalInventoryCategory(formData.get("category"));

  if (!name) redirect(`${INVENTORY_PATH}?inventoryError=name-required`);
  if (name.length > 120) redirect(`${INVENTORY_PATH}?inventoryError=name-too-long`);
  if (!Number.isFinite(quantity) || quantity <= 0) redirect(`${INVENTORY_PATH}?inventoryError=invalid-quantity`);
  if (!isInventoryUnit(unit)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-unit`);
  if (!isInventoryLocation(location)) redirect(`${INVENTORY_PATH}?inventoryError=invalid-location`);
  if (!category.ok) redirect(`${INVENTORY_PATH}?inventoryError=invalid-category`);

  const nutritionFields = getOptionalNutritionFields(formData);

  return {
    name,
    quantity,
    unit,
    location,
    category: category.value,
    expiresAt: getOptionalExpirationDate(formData),
    ...nutritionFields,
  };
}

export async function addInventoryItemAction(formData: FormData) {
  const { name, quantity, unit, location, category, expiresAt, nutritionBasis, calories, proteinG, carbsG, fatG } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item creation");

  const { error } = await (supabase as any).from("inventory_items").insert({
    user_id: user.id,
    name,
    quantity,
    unit,
    location,
    category,
    nutrition_basis: nutritionBasis,
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    expires_at: expiresAt,
  });

  if (error) {
    console.warn("Supabase could not save the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=save-failed`);
  }

  const rememberBarcode = formData.get("remember_barcode_product") === "on";
  const barcodeValidation = validateBarcodeInput(String(formData.get("barcode") ?? ""));

  if (rememberBarcode) {
    if (!barcodeValidation.ok) {
      revalidatePath(INVENTORY_PATH);
      redirect(`${INVENTORY_PATH}?inventorySuccess=item-created-barcode-memory-failed`);
    }

    const { data: rememberedBarcodeProduct, error: barcodeError } = await (supabase as any)
      .from("user_barcode_products")
      .upsert({
        user_id: user.id,
        barcode: barcodeValidation.barcode,
        name,
        default_quantity: quantity,
        default_unit: unit,
        default_location: location,
        default_category: category,
        nutrition_basis: nutritionBasis,
        calories,
        protein_g: proteinG,
        carbs_g: carbsG,
        fat_g: fatG,
      }, { onConflict: "user_id,barcode" })
      .select("id")
      .maybeSingle() as { data: { id: string } | null; error: { message: string } | null };

    if (barcodeError || !rememberedBarcodeProduct) {
      console.warn("Supabase could not remember the barcode product:", barcodeError?.message ?? "No barcode product was returned.");
      revalidatePath(INVENTORY_PATH);
      redirect(`${INVENTORY_PATH}?inventorySuccess=item-created-barcode-memory-failed`);
    }
  }

  revalidatePath(INVENTORY_PATH);
  redirect(`${INVENTORY_PATH}?inventorySuccess=item-created`);
}

export async function updateInventoryItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=update-not-found`);

  const { name, quantity, unit, location, category, expiresAt, nutritionBasis, calories, proteinG, carbsG, fatG } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item update");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .update({
      name,
      quantity,
      unit,
      location,
      category,
      nutrition_basis: nutritionBasis,
      calories,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
      expires_at: expiresAt,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not update the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=update-failed`);
  }

  if (!data?.length) redirect(`${INVENTORY_PATH}?inventoryError=update-not-found`);

  revalidatePath(INVENTORY_PATH);
  redirect(`${INVENTORY_PATH}?inventorySuccess=item-updated`);
}

export async function consumeInventoryItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const consumedQuantity = Number(formData.get("consumed_quantity"));

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=consume-not-found`);
  if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
    redirect(`${INVENTORY_PATH}?inventoryError=invalid-quantity`);
  }

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "inventory item consumption");

  const { data, error } = await (supabase as any).rpc("consume_inventory_item", {
    p_item_id: id,
    p_quantity: consumedQuantity,
  }) as { data: number | string | null; error: { code?: string; message: string } | null };

  if (error) {
    console.warn("Supabase could not consume the inventory item:", error.message);

    if (error.code === "22003") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-too-much`);
    }

    if (error.code === "P0002") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-not-found`);
    }

    redirect(`${INVENTORY_PATH}?inventoryError=consume-failed`);
  }

  const remainingQuantity = Number(data);

  revalidatePath(INVENTORY_PATH);
  redirect(
    `${INVENTORY_PATH}?inventorySuccess=${remainingQuantity === 0 ? "item-consumed-completely" : "item-consumed"}`,
  );
}

export async function consumeInventoryItemAndLogMealAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const consumedQuantity = Number(formData.get("consumed_quantity"));
  const mealType = String(formData.get("meal_type") ?? "").trim();

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=consume-log-not-found`);
  if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
    redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-quantity`);
  }
  if (!isMealType(mealType)) redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-meal-type`);

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "inventory item consumption meal log");

  const { data, error } = await (supabase as any).rpc("consume_inventory_item_and_log_meal", {
    p_item_id: id,
    p_consumed_quantity: consumedQuantity,
    p_meal_type: mealType,
  }) as { data: number | string | null; error: { code?: string; message: string } | null };

  if (error) {
    console.warn("Supabase could not consume the inventory item and log a meal:", error.message);

    if (error.code === "P0002") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-not-found`);
    }

    if (error.code === "22003") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-too-much`);
    }

    if (error.message === "Incomplete inventory nutrition") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-incomplete-nutrition`);
    }

    if (error.message === "Incompatible inventory nutrition unit") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-incompatible-unit`);
    }

    if (error.message === "Invalid meal type") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-meal-type`);
    }

    if (error.message === "Invalid consumed quantity") {
      redirect(`${INVENTORY_PATH}?inventoryError=consume-log-invalid-quantity`);
    }

    redirect(`${INVENTORY_PATH}?inventoryError=consume-log-failed`);
  }

  const remainingQuantity = Number(data);

  revalidatePath(INVENTORY_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/meal-history");
  redirect(
    `${INVENTORY_PATH}?inventorySuccess=${remainingQuantity === 0 ? "item-consumed-logged-completely" : "item-consumed-logged"}`,
  );
}

export async function deleteInventoryItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) redirect(`${INVENTORY_PATH}?inventoryError=delete-not-found`);

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item deletion");

  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null };

  if (error) {
    console.warn("Supabase could not delete the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=delete-failed`);
  }

  if (!data?.length) redirect(`${INVENTORY_PATH}?inventoryError=delete-not-found`);

  revalidatePath(INVENTORY_PATH);
  redirect(`${INVENTORY_PATH}?inventorySuccess=item-deleted`);
}

export async function estimateVoiceInventoryBatchAction(text: string) {
  const { parseVoiceInventoryBatchInput } = await import("@/modules/inventory/voice-inventory-batch");
  const input = parseVoiceInventoryBatchInput(text);
  if (!input) return { status: "error" as const, code: "invalid-input" as const, message: "Escribe una lista de hasta 4.000 caracteres." };
  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "voice inventory batch estimate");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "error" as const, code: "not-configured" as const, message: "La estimación con IA no está configurada todavía." };
  const { generateVoiceInventoryBatch } = await import("@/lib/openai/voice-inventory-batch-generation");
  return generateVoiceInventoryBatch(input, { apiKey, model: process.env.OPENAI_VOICE_INVENTORY_BATCH_MODEL || undefined });
}

export type SaveVoiceInventoryBatchResult =
  | { status: "success"; outcome: "saved" | "already-saved"; insertedCount: number; message: string }
  | { status: "error"; code: "invalid-input" | "invalid-batch-payload" | "submission-conflict" | "save-failed"; message: string };

export async function saveVoiceInventoryBatchAction(submissionId: string, items: unknown): Promise<SaveVoiceInventoryBatchResult> {
  const parsed = toVoiceInventoryBatchSaveInput(submissionId, items);
  if (!parsed.success) return { status: "error", code: "invalid-input", message: "Revisa los productos antes de añadirlos al inventario." };

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "voice inventory batch save");
  const { data, error } = await (supabase as any).rpc("save_voice_inventory_batch", {
    p_submission_id: parsed.data.submissionId,
    p_items: parsed.data.items,
  }) as { data: { status: "saved" | "already-saved"; inserted_count: number }[] | null; error: { code?: string; message?: string } | null };
  if (error) {
    const code = error.message === "submission-conflict" ? "submission-conflict" : error.message === "invalid-batch-payload" ? "invalid-batch-payload" : "save-failed";
    return { status: "error", code, message: code === "submission-conflict" ? "Este envío ya se utilizó con productos distintos." : code === "invalid-batch-payload" ? "Revisa los productos antes de añadirlos al inventario." : "No se pudieron añadir los productos. Inténtalo de nuevo." };
  }
  const result = data?.[0];
  if (!result || !["saved", "already-saved"].includes(result.status) || !Number.isInteger(result.inserted_count)) return { status: "error", code: "save-failed", message: "No se pudieron añadir los productos. Inténtalo de nuevo." };
  revalidatePath(INVENTORY_PATH);
  return { status: "success", outcome: result.status, insertedCount: result.inserted_count, message: `Se añadieron ${result.inserted_count} productos al inventario.` };
}
