"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveInventoryNutritionForUser } from "@/lib/nutrition/catalog-resolver";
import { generateVoiceShoppingBatch } from "@/lib/openai/voice-shopping-batch-generation";
import { parseVoiceShoppingBatchInput, type VoiceShoppingBatchResult } from "@/modules/shopping/voice-shopping-batch";
import { toVoiceShoppingBatchSaveInput } from "@/modules/shopping/voice-shopping-batch-save";
import { requireAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { classifyAiResult, createAiUsageMeter } from "@/lib/ai/metering";
import { INVENTORY_NUTRITION_AI_MODEL_DEFAULT } from "@/modules/inventory/inventory-ai-nutrition";
import { createLogger, hasCorrelation, withCorrelationIfMissing } from "@/lib/server/logger";
import {
  getShoppingListTransferNutritionPlan,
  planShoppingListTransferResolutionUpdate,
  type TransferredInventoryNutritionItem,
} from "@/modules/shopping-list/shopping-list-transfer-nutrition";

type ShoppingListUnit = "ud" | "g" | "kg" | "ml" | "l";
type InventoryLocation = "pantry" | "fridge" | "freezer";

const shoppingListUnits = ["ud", "g", "kg", "ml", "l"] as const;
const inventoryLocations = ["pantry", "fridge", "freezer"] as const;
const shoppingListTransferRevalidationPaths = [
  "/shopping-list",
  "/inventory",
  "/dashboard",
  "/recipes",
  "/meal-builder",
] as const;
const SHOPPING_LIST_PATH = "/shopping-list";

function isShoppingListUnit(value: string): value is ShoppingListUnit {
  return shoppingListUnits.includes(value as ShoppingListUnit);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isInventoryLocation(value: string): value is InventoryLocation {
  return inventoryLocations.includes(value as InventoryLocation);
}

function revalidateShoppingListTransferPaths() {
  for (const path of shoppingListTransferRevalidationPaths) {
    revalidatePath(path);
  }
}

export type SaveVoiceShoppingBatchResult =
  | { status: "success"; outcome: "saved" | "already-saved"; insertedCount: number; message: string }
  | { status: "error"; code: "invalid-input" | "invalid-batch-payload" | "submission-conflict" | "save-failed"; message: string };

export async function saveVoiceShoppingBatchAction(
  submissionId: string,
  items: unknown,
): Promise<SaveVoiceShoppingBatchResult> {
  const parsed = toVoiceShoppingBatchSaveInput(submissionId, items);
  if (!parsed.success) {
    return { status: "error", code: "invalid-input", message: "Revisa los productos antes de añadirlos a la lista de compra." };
  }

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase, "voice shopping batch save");
  const { data, error } = await (supabase as any).rpc("save_voice_shopping_batch", {
    p_submission_id: parsed.data.submissionId,
    p_items: parsed.data.items,
  }) as { data: { status: "saved" | "already-saved"; inserted_count: number }[] | null; error: { message?: string } | null };

  if (error) {
    const code = error.message === "submission-conflict"
      ? "submission-conflict"
      : error.message === "invalid-batch-payload"
        ? "invalid-batch-payload"
        : "save-failed";
    return {
      status: "error",
      code,
      message: code === "submission-conflict"
        ? "Este envío ya se utilizó con productos distintos."
        : code === "invalid-batch-payload"
          ? "Revisa los productos antes de añadirlos a la lista de compra."
          : "No se pudieron añadir los productos. Inténtalo de nuevo.",
    };
  }

  const result = data?.[0];
  if (!result || !["saved", "already-saved"].includes(result.status) || !Number.isInteger(result.inserted_count)) {
    return { status: "error", code: "save-failed", message: "No se pudieron añadir los productos. Inténtalo de nuevo." };
  }

  revalidatePath(SHOPPING_LIST_PATH);
  return { status: "success", outcome: result.status, insertedCount: result.inserted_count, message: `Se añadieron ${result.inserted_count} productos a la lista de compra.` };
}

function getOptionalExpirationDate(formData: FormData) {
  const rawValue = String(formData.get("expires_at") ?? "").trim();

  if (!rawValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    redirect("/shopping-list?shoppingListError=invalid-expires-at");
  }

  const date = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawValue) {
    redirect("/shopping-list?shoppingListError=invalid-expires-at");
  }

  return rawValue;
}

function getValidatedShoppingListFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");

  if (!name) {
    redirect("/shopping-list?shoppingListError=name-required");
  }

  if (name.length > 120) {
    redirect("/shopping-list?shoppingListError=name-too-long");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect("/shopping-list?shoppingListError=invalid-quantity");
  }

  if (!isShoppingListUnit(unit)) {
    redirect("/shopping-list?shoppingListError=invalid-unit");
  }

  return { name, quantity, unit };
}

export async function addShoppingListItemAction(formData: FormData) {
  const { name, quantity, unit } = getValidatedShoppingListFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item creation");

  const { error } = await (supabase as any).from("shopping_list_items").insert({
    user_id: user.id,
    name,
    quantity,
    unit,
  });

  if (error) {
    console.warn("Supabase could not save the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=save-failed");
  }

  revalidatePath("/shopping-list");
  redirect("/shopping-list?shoppingListSuccess=item-created");
}

export async function updateShoppingListItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  const { name, quantity, unit } = getValidatedShoppingListFields(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item update");

  const { data, error } = await (supabase as any)
    .from("shopping_list_items")
    .update({
      name,
      quantity,
      unit,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not update the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=update-failed");
  }

  if (!data?.length) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  revalidatePath("/shopping-list");
  redirect("/shopping-list?shoppingListSuccess=item-updated");
}

export async function setShoppingListItemPurchasedAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const rawIsPurchased = String(formData.get("is_purchased") ?? "");

  if (!isUuid(id) || (rawIsPurchased !== "true" && rawIsPurchased !== "false")) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  const isPurchased = rawIsPurchased === "true";
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item purchase state update");

  const { data, error } = await (supabase as any)
    .from("shopping_list_items")
    .update({ is_purchased: isPurchased })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not update the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=update-failed");
  }

  if (!data?.length) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  revalidatePath("/shopping-list");
  redirect(`/shopping-list?shoppingListSuccess=${isPurchased ? "item-purchased" : "item-pending"}`);
}

export async function transferShoppingListItemToInventoryAction(formData: FormData): Promise<never> {
  if (!hasCorrelation()) return withCorrelationIfMissing(() => transferShoppingListItemToInventoryAction(formData));
  const logger = createLogger("shopping_list", "transfer_to_inventory");
  const id = String(formData.get("id") ?? "").trim();
  const location = String(formData.get("location") ?? "");

  if (!isUuid(id)) {
    redirect("/shopping-list?shoppingListError=transfer-unavailable");
  }

  if (!isInventoryLocation(location)) {
    redirect("/shopping-list?shoppingListError=invalid-location");
  }

  const expiresAt = getOptionalExpirationDate(formData);
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item inventory transfer");

  const { data, error } = await (supabase as any).rpc("transfer_purchased_shopping_item_to_inventory", {
    p_item_id: id,
    p_location: location,
    p_expires_at: expiresAt,
  }) as {
    data: string | null;
    error: { message: string } | null;
  };

  if (error) {
    logger.error("transfer_failed", { error });
    redirect("/shopping-list?shoppingListError=transfer-failed");
  }

  if (!data || !isUuid(data)) {
    redirect("/shopping-list?shoppingListError=transfer-unavailable");
  }

  const transferredInventoryItemId = data;
  let shoppingListSuccess = "item-transferred-macros-pending";

  const { data: transferredItem, error: transferredItemError } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, quantity, unit, category, nutrition_basis, calories, protein_g, carbs_g, fat_g, food_catalog_item_id")
    .eq("id", transferredInventoryItemId)
    .eq("user_id", user.id)
    .maybeSingle() as {
      data: TransferredInventoryNutritionItem | null;
      error: { message: string } | null;
    };

  if (transferredItemError || !transferredItem) {
    logger.warn("transferred_inventory_read_failed", { error: transferredItemError, reason: transferredItem ? undefined : "not-found" });
    revalidateShoppingListTransferPaths();
    redirect(`/shopping-list?shoppingListSuccess=${shoppingListSuccess}`);
  }

  const nutritionPlan = getShoppingListTransferNutritionPlan(transferredItem);

  if (nutritionPlan.status === "already-complete") {
    shoppingListSuccess = "item-transferred-with-nutrition";
  } else if (nutritionPlan.status === "estimate") {
    const model = process.env.OPENAI_INVENTORY_NUTRITION_MODEL ?? INVENTORY_NUTRITION_AI_MODEL_DEFAULT;
    const meter = createAiUsageMeter({ userId: user.id, feature: "inventory_nutrition", model });
    if (!meter.authorizeFeature()) {
      await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
      revalidateShoppingListTransferPaths();
      redirect(`/shopping-list?shoppingListSuccess=${shoppingListSuccess}`);
    }
    const nutritionResult = await resolveInventoryNutritionForUser(supabase, user.id, nutritionPlan.input, {
      fetchImpl: meter.fetchImpl,
      openAiModel: model,
    });
    await meter.finish({ ...classifyAiResult(nutritionResult), cacheHit: nutritionResult.meteringCacheHit });

    if (nutritionResult.status === "resolved") {
      const resolutionUpdate = planShoppingListTransferResolutionUpdate(transferredItem.food_catalog_item_id, nutritionResult);
      if (resolutionUpdate.status === "apply") {
        let updateQuery = (supabase as any)
          .from("inventory_items")
          .update(resolutionUpdate.update)
          .eq("id", transferredInventoryItemId)
          .eq("user_id", user.id)
          .is("nutrition_basis", null)
          .is("calories", null)
          .is("protein_g", null)
          .is("carbs_g", null)
          .is("fat_g", null);
        updateQuery = resolutionUpdate.expectedFoodCatalogItemId === null
          ? updateQuery.is("food_catalog_item_id", null)
          : updateQuery.eq("food_catalog_item_id", resolutionUpdate.expectedFoodCatalogItemId);
        const { data: updatedNutritionRows, error: updateNutritionError } = await updateQuery.select("id") as {
            data: { id: string }[] | null;
            error: { message: string } | null;
          };

        if (updateNutritionError) {
          logger.warn("nutrition_update_failed", { error: updateNutritionError });
        } else if (updatedNutritionRows?.length === 1) {
          if (!resolutionUpdate.needsReview) {
            shoppingListSuccess = "item-transferred-with-nutrition";
          }
        } else {
          logger.warn("nutrition_update_conflict");
        }
      } else {
        logger.warn("nutrition_identity_conflict");
      }
    } else {
      logger.warn("nutrition_resolution_incomplete", { status: nutritionResult.status });
    }
  }

  revalidateShoppingListTransferPaths();
  redirect(`/shopping-list?shoppingListSuccess=${shoppingListSuccess}`);
}

export async function deleteShoppingListItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list item deletion");

  const { data, error } = await (supabase as any)
    .from("shopping_list_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id") as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.warn("Supabase could not delete the shopping list item:", error.message);
    redirect("/shopping-list?shoppingListError=delete-failed");
  }

  if (!data?.length) {
    redirect("/shopping-list?shoppingListError=item-not-found");
  }

  revalidatePath("/shopping-list");
  redirect("/shopping-list?shoppingListSuccess=item-deleted");
}


/** Estimates a local-only shopping-list draft; it deliberately performs no persistence. */
export async function estimateVoiceShoppingBatchAction(text: string): Promise<VoiceShoppingBatchResult> {
  if (!hasCorrelation()) return withCorrelationIfMissing(() => estimateVoiceShoppingBatchAction(text));
  const input = parseVoiceShoppingBatchInput(text);
  if (!input) return { status: "error", code: "invalid-input", message: "Escribe una lista de entre 1 y 4.000 caracteres." };
  const supabase = await createClient();
  const user = await requireAuthenticatedUser(supabase, "shopping list batch estimate");
  const model = process.env.OPENAI_VOICE_SHOPPING_BATCH_MODEL || "gpt-5.6-terra";
  const meter = createAiUsageMeter({ userId: user.id, feature: "voice_shopping", model });
  if (!meter.authorizeFeature()) {
    await meter.finish({ outcome: "error", errorCode: "ai-feature-disabled" });
    return { status: "error", code: "ai-feature-disabled", message: "Esta función no está disponible." };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "error", code: "not-configured", message: "El análisis no está disponible ahora." };
  const result = await generateVoiceShoppingBatch(input, { apiKey, model, fetchImpl: meter.fetchImpl });
  await meter.finish(classifyAiResult(result));
  const accessError = meter.getAccessError();
  if (accessError) return { status: "error", code: accessError, message: accessError === "daily-ai-limit" ? "Has alcanzado el límite de funciones con IA de hoy. Podrás volver a usarlas mañana." : "Esta función no está disponible ahora." };
  return result;
}
