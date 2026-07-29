"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { validateBarcodeInput } from "@/modules/barcodes/barcode";
import { createClient } from "@/lib/supabase/server";
import { validateOptionalInventoryCategory, type InventoryCategory } from "@/modules/inventory/inventory-categories";
import { planInventoryFoodIdentityUpdate } from "@/modules/inventory/inventory-food-identity";
import {
  hasInventoryNutritionValues,
  isInventoryNutritionBasis,
  parseOptionalInventoryNutritionNumber,
} from "@/modules/inventory/inventory-nutrition";
import { isMealType } from "@/modules/meals/meal-types";
import { lookupOpenFoodFactsProduct } from "@/lib/nutrition/open-food-facts";
import { resolveInventoryNutritionForUser } from "@/lib/nutrition/catalog-resolver";
import { catalogRequestKey, confirmedCatalogRow, persistConfirmedNutritionBatchWithIdentities } from "@/modules/nutrition/catalog";
import { parseInventoryNutritionAiInput, type InventoryNutritionAiEstimate, type InventoryNutritionAiInput } from "@/modules/inventory/inventory-ai-nutrition";
import { toVoiceInventoryBatchSaveInput, VoiceInventoryBatchCatalogMetadataSchema } from "@/modules/inventory/voice-inventory-batch-save";
import { buildObservedPackageEquivalenceProposals } from "@/modules/inventory/voice-inventory-package-equivalences";
import { buildBarcodePackageEquivalenceProposal } from "@/modules/inventory/barcode-package-equivalence";

type InventoryLocation = "pantry" | "fridge" | "freezer";
type InventoryUnit = "ud" | "g" | "kg" | "ml" | "l";

const INVENTORY_PATH = "/inventory";
const INVENTORY_EQUIVALENCES_PATH = "/inventory/equivalences";
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
  "not-configured": "El cálculo nutricional no está configurado todavía.",
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
  const user = await requireAuthenticatedUser(supabase, "inventory nutrition AI estimate");

  const result = await resolveInventoryNutritionForUser(supabase, user.id, validatedInput);
  if (result.status === "needs-clarification") return result;
  if (result.status !== "resolved") return inventoryNutritionAiError(result.reason === "not-configured" ? "not-configured" : "provider-error");
  return { status: "success", estimate: { nutrition_basis: result.nutritionBasis, calories: result.calories, protein_g: result.proteinG, carbs_g: result.carbsG, fat_g: result.fatG, confidence: "medium", assumptions: result.assumptions, food_catalog_item_id: result.foodCatalogItemId ?? null } };
}

function isInventoryLocation(value: string): value is InventoryLocation {
  return inventoryLocations.includes(value as InventoryLocation);
}

function isInventoryUnit(value: string): value is InventoryUnit {
  return inventoryUnits.includes(value as InventoryUnit);
}


type BarcodeProductLookupResult =
  | { status: "invalid"; message: string }
  | { status: "found"; product: { barcode: string; name: string; default_quantity: number | null; default_unit: InventoryUnit | null; default_location: InventoryLocation | null; category: InventoryCategory | null; nutrition_basis?: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } }
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
    const external = await lookupOpenFoodFactsProduct(validation.barcode);
    if (external.status === "provider-error") return { status: "error", message: "No se pudo consultar el producto. Inténtalo de nuevo." };
    if (external.status === "not-found") return { status: "unknown", barcode: validation.barcode, message: "No encontramos este código. Completa los datos manualmente." };
    const nutrition = external.product.nutrition;
    return { status: "found", product: { barcode: validation.barcode, name: external.product.name, default_quantity: external.product.package?.quantity ?? null, default_unit: external.product.package?.unit ?? null, default_location: null, category: null, nutrition_basis: nutrition?.basis, calories: nutrition?.calories ?? null, protein_g: nutrition?.proteinG ?? null, carbs_g: nutrition?.carbsG ?? null, fat_g: nutrition?.fatG ?? null } };
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

async function cacheConfirmedInventoryNutrition(supabase: any, input: { userId: string; name: string; unit: string; nutritionBasis: ReturnType<typeof getValidatedInventoryFields>["nutritionBasis"]; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; source?: "user" | "barcode-memory"; externalId?: string | null; foodCatalogItemId?: string | null }) {
  if (!input.nutritionBasis || ![input.calories, input.proteinG, input.carbsG, input.fatG].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) return null;
  try {
    const row = confirmedCatalogRow({ ...input, nutritionBasis: input.nutritionBasis, calories: input.calories!, proteinG: input.proteinG!, carbsG: input.carbsG!, fatG: input.fatG! });
    row.food_catalog_item_id = input.foodCatalogItemId ?? null;
    const result = await persistConfirmedNutritionBatchWithIdentities(supabase, [row]);
    return result.foodCatalogItemIds.get(catalogRequestKey(row.normalized_name, row.food_state, row.nutrition_basis)) ?? null;
  } catch (error) {
    console.warn("Supabase could not update the nutrition catalog:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function addInventoryItemAction(formData: FormData) {
  const { name, quantity, unit, location, category, expiresAt, nutritionBasis, calories, proteinG, carbsG, fatG } = getValidatedInventoryFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "inventory item creation");
  const rememberBarcode = formData.get("remember_barcode_product") === "on";
  const barcodeValidation = validateBarcodeInput(String(formData.get("barcode") ?? ""));
  const resolvedName = String(formData.get("catalog_resolved_name") ?? "").trim();
  const submittedCatalogId = String(formData.get("food_catalog_item_id") ?? "").trim();
  const existingFoodCatalogItemId = resolvedName === name && isUuid(submittedCatalogId) ? submittedCatalogId : null;
  const foodCatalogItemId = await cacheConfirmedInventoryNutrition(supabase, { userId: user.id, name, unit, nutritionBasis, calories, proteinG, carbsG, fatG,
    source: rememberBarcode && barcodeValidation.ok ? "barcode-memory" : "user", externalId: barcodeValidation.ok ? barcodeValidation.barcode : null,
    foodCatalogItemId: existingFoodCatalogItemId });

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
    food_catalog_item_id: foodCatalogItemId,
    expires_at: expiresAt,
  });

  if (error) {
    console.warn("Supabase could not save the inventory item:", error.message);
    redirect(`${INVENTORY_PATH}?inventoryError=save-failed`);
  }

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

    if (foodCatalogItemId) {
      let proposalFailed = false;
      try {
        const external = await lookupOpenFoodFactsProduct(barcodeValidation.barcode);
        if (external.status === "provider-error") {
          console.warn("The package measure lookup failed while remembering a barcode product.");
          proposalFailed = true;
        } else if (external.status === "found" && external.product.package) {
          const proposal = buildBarcodePackageEquivalenceProposal({ barcode: barcodeValidation.barcode, foodCatalogItemId, package: external.product.package });
          if (proposal) {
            const { error: proposalError } = await (supabase as any).rpc("save_food_quantity_equivalence_proposal", {
              p_food_catalog_item_id: proposal.foodCatalogItemId,
              p_measure_kind: proposal.measureKind,
              p_variant_key: proposal.variantKey,
              p_display_label: proposal.displayLabel,
              p_canonical_quantity: proposal.canonicalQuantity,
              p_canonical_unit: proposal.canonicalUnit,
              p_source: "barcode-memory",
            });
            if (proposalError) {
              console.warn("Supabase could not remember the barcode package measure:", proposalError.message);
              proposalFailed = true;
            }
          }
        }
      } catch (proposalError) {
        console.warn("An unexpected error prevented remembering the barcode package measure:", proposalError instanceof Error ? proposalError.message : proposalError);
        proposalFailed = true;
      }
      revalidatePath(INVENTORY_PATH);
      revalidatePath(INVENTORY_EQUIVALENCES_PATH);
      if (proposalFailed) redirect(`${INVENTORY_PATH}?inventorySuccess=item-created-barcode-measure-failed`);
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
  const { data: current } = await (supabase as any).from("inventory_items").select("name,food_catalog_item_id").eq("id", id).eq("user_id", user.id).maybeSingle() as { data: { name: string; food_catalog_item_id: string | null } | null };
  if (!current) redirect(`${INVENTORY_PATH}?inventoryError=update-not-found`);
  const resolvedName = String(formData.get("catalog_resolved_name") ?? "").trim();
  const submittedCatalogId = String(formData.get("food_catalog_item_id") ?? "").trim();
  const explicitlyResolvedId = resolvedName === name && isUuid(submittedCatalogId) ? submittedCatalogId : null;
  const hasCompleteNutrition = Boolean(nutritionBasis) && [calories, proteinG, carbsG, fatG].every((value) => typeof value === "number");
  const identityUpdate = planInventoryFoodIdentityUpdate({
    currentName: current.name,
    currentFoodCatalogItemId: current.food_catalog_item_id,
    nextName: name,
    explicitlyResolvedFoodCatalogItemId: explicitlyResolvedId,
    hasCompleteNutrition,
  });
  const resolvedFoodCatalogItemId = identityUpdate.shouldPersistConfirmedNutrition
    ? await cacheConfirmedInventoryNutrition(supabase, { userId: user.id, name, unit, nutritionBasis, calories, proteinG, carbsG, fatG,
      foodCatalogItemId: identityUpdate.catalogFoodCatalogItemId })
    : null;

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
      food_catalog_item_id: resolvedFoodCatalogItemId ?? identityUpdate.fallbackFoodCatalogItemId,
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
  const user = await requireAuthenticatedUser(supabase, "voice inventory batch estimate");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "error" as const, code: "not-configured" as const, message: "La estimación con IA no está configurada todavía." };
  const { generateVoiceInventoryBatch } = await import("@/lib/openai/voice-inventory-batch-generation");
  const generated = await generateVoiceInventoryBatch(input, { apiKey, model: process.env.OPENAI_VOICE_INVENTORY_BATCH_MODEL || undefined });
  if (generated.status === "error") return generated;
  try {
    const { applyNutritionCatalogToVoiceBatch } = await import("@/modules/inventory/voice-inventory-catalog");
    return await applyNutritionCatalogToVoiceBatch(supabase, user.id, generated);
  } catch (error) {
    console.warn("Supabase could not apply the nutrition catalog to the voice draft:", error instanceof Error ? error.message : error);
    return generated;
  }
}

export type SaveVoiceInventoryBatchResult =
  | { status: "success"; outcome: "saved" | "already-saved"; insertedCount: number; rememberedMeasureCount: number; proposalWarning?: string; message: string }
  | { status: "error"; code: "invalid-input" | "invalid-batch-payload" | "submission-conflict" | "save-failed"; message: string };

export async function saveVoiceInventoryBatchAction(submissionId: string, items: unknown, catalogMetadata: unknown): Promise<SaveVoiceInventoryBatchResult> {
  const parsed = toVoiceInventoryBatchSaveInput(submissionId, items);
  if (!parsed.success) return { status: "error", code: "invalid-input", message: "Revisa los productos antes de añadirlos al inventario." };
  const parsedCatalogMetadata = VoiceInventoryBatchCatalogMetadataSchema.safeParse(catalogMetadata);
  const alignedCatalogMetadata = parsedCatalogMetadata.success
    && parsedCatalogMetadata.data.length === parsed.data.items.length
    && parsedCatalogMetadata.data.every((metadata, index) => metadata.name === parsed.data.items[index].name)
    ? parsedCatalogMetadata.data
    : null;

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "voice inventory batch save");
  let itemsWithIdentities = parsed.data.items.map((item) => ({ ...item, food_catalog_item_id: null as string | null }));
  try {
    if (alignedCatalogMetadata) {
      const rows = parsed.data.items.map((item, index) => confirmedCatalogRow({ userId: user.id, name: item.name, unit: item.unit, foodState: alignedCatalogMetadata[index].food_state, nutritionBasis: item.nutrition_basis, calories: item.calories, proteinG: item.protein_g, carbsG: item.carbs_g, fatG: item.fat_g }));
      const identities = await persistConfirmedNutritionBatchWithIdentities(supabase, rows);
      itemsWithIdentities = itemsWithIdentities.map((item, index) => ({ ...item, food_catalog_item_id: identities.foodCatalogItemIds.get(catalogRequestKey(rows[index].normalized_name, rows[index].food_state, rows[index].nutrition_basis)) ?? null }));
    }
  } catch (error) {
    console.warn("Supabase could not cache the confirmed voice batch nutrition:", error instanceof Error ? error.message : error);
  }
  const { data, error } = await (supabase as any).rpc("save_voice_inventory_batch", {
    p_submission_id: parsed.data.submissionId,
    p_items: itemsWithIdentities,
  }) as { data: { status: "saved" | "already-saved"; inserted_count: number }[] | null; error: { code?: string; message?: string } | null };
  if (error) {
    const code = error.message === "submission-conflict" ? "submission-conflict" : error.message === "invalid-batch-payload" ? "invalid-batch-payload" : "save-failed";
    return { status: "error", code, message: code === "submission-conflict" ? "Este envío ya se utilizó con productos distintos." : code === "invalid-batch-payload" ? "Revisa los productos antes de añadirlos al inventario." : "No se pudieron añadir los productos. Inténtalo de nuevo." };
  }
  const result = data?.[0];
  if (!result || !["saved", "already-saved"].includes(result.status) || !Number.isInteger(result.inserted_count)) return { status: "error", code: "save-failed", message: "No se pudieron añadir los productos. Inténtalo de nuevo." };
  let rememberedMeasureCount = 0;
  let proposalFailures = 0;
  if (alignedCatalogMetadata) {
    const proposals = buildObservedPackageEquivalenceProposals(itemsWithIdentities, alignedCatalogMetadata);
    for (const proposal of proposals) {
      const { error: proposalError } = await (supabase as any).rpc("save_food_quantity_equivalence_proposal", {
        p_food_catalog_item_id: proposal.foodCatalogItemId,
        p_measure_kind: proposal.measureKind,
        p_variant_key: proposal.variantKey,
        p_display_label: proposal.displayLabel,
        p_canonical_quantity: proposal.canonicalQuantity,
        p_canonical_unit: proposal.canonicalUnit,
        p_source: "observed-package",
      }) as { error: { message?: string } | null };
      if (proposalError) {
        proposalFailures += 1;
        console.warn("Supabase could not remember an observed package measure:", proposalError.message ?? "Unknown proposal error.");
      } else rememberedMeasureCount += 1;
    }
  }
  revalidatePath(INVENTORY_PATH);
  revalidatePath("/inventory/equivalences");
  const proposalWarning = proposalFailures > 0 ? "Los productos se añadieron, pero no se pudo recordar una de las medidas." : undefined;
  const productMessage = `Se añadieron ${result.inserted_count} productos`;
  const measureMessage = rememberedMeasureCount > 0 ? ` y se ${rememberedMeasureCount === 1 ? "recordó 1 medida habitual" : `recordaron ${rememberedMeasureCount} medidas habituales`}` : "";
  return { status: "success", outcome: result.status, insertedCount: result.inserted_count, rememberedMeasureCount, proposalWarning, message: proposalWarning ?? `${productMessage}${measureMessage}.` };
}
