import { z } from "zod";

export const VOICE_SHOPPING_BATCH_MAX_LENGTH = 4000;
export const VOICE_SHOPPING_BATCH_MAX_ITEMS = 30;
export const VOICE_SHOPPING_BATCH_UNITS = ["ud", "g", "kg", "ml", "l"] as const;
export const VOICE_SHOPPING_BATCH_ISSUES = [
  "quantity-missing",
  "unit-missing",
  "package-size-missing",
  "ambiguous-product",
  "low-confidence",
] as const;

export type VoiceShoppingDraftIssue = (typeof VOICE_SHOPPING_BATCH_ISSUES)[number];

const finiteNonNegative = z.number().finite().min(0);

export const VoiceShoppingDraftItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: finiteNonNegative.nullable(),
  unit: z.enum(VOICE_SHOPPING_BATCH_UNITS).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  issues: z.array(z.enum(VOICE_SHOPPING_BATCH_ISSUES)).max(5),
}).strict();

export const VoiceShoppingBatchOutputSchema = z.object({
  items: z.array(VoiceShoppingDraftItemSchema).min(1).max(VOICE_SHOPPING_BATCH_MAX_ITEMS),
}).strict();

export type VoiceShoppingDraftItem = z.infer<typeof VoiceShoppingDraftItemSchema> & {
  client_id: string;
  /** Local-only acknowledgement; it is never supplied by the AI or persisted. */
  review_acknowledged?: boolean;
};

export type VoiceShoppingBatchResult =
  | { status: "success"; items: VoiceShoppingDraftItem[] }
  | { status: "needs-clarification"; items: VoiceShoppingDraftItem[]; message: string }
  | { status: "error"; code: "invalid-input" | "too-many-products" | "not-configured" | "daily-ai-cost-limit" | "daily-ai-limit" | "ai-access-unavailable" | "ai-feature-disabled" | "timeout" | "rate-limited" | "provider-error" | "invalid-ai-response"; message: string };

export function parseVoiceShoppingBatchInput(text: string) {
  const value = text.trim();
  return value && value.length <= VOICE_SHOPPING_BATCH_MAX_LENGTH ? value : null;
}

export function normalizeVoiceShoppingDraftItem(item: z.infer<typeof VoiceShoppingDraftItemSchema>) {
  const issues = new Set(item.issues);
  const name = item.name.trim();
  const derivedIssues = [
    ["quantity-missing", item.quantity === null || item.quantity <= 0],
    ["unit-missing", item.unit === null],
    ["low-confidence", item.confidence === "low"],
  ] as const;

  for (const [issue, needed] of derivedIssues) {
    if (needed) issues.add(issue);
    else issues.delete(issue);
  }

  if (item.quantity !== null && item.quantity > 0 && item.unit !== null) {
    issues.delete("package-size-missing");
  }

  return { ...item, name, issues: [...issues] };
}

export function normalizeEditedVoiceShoppingDraftItem(
  item: VoiceShoppingDraftItem,
  field: "name" | "quantity" | "unit",
  value: unknown,
): VoiceShoppingDraftItem {
  const next = { ...item, [field]: value } as z.infer<typeof VoiceShoppingDraftItemSchema>;
  if (field === "name" && typeof value === "string" && value.trim()) {
    next.issues = next.issues.filter((issue) => issue !== "ambiguous-product");
  }

  const normalized = normalizeVoiceShoppingDraftItem(next);
  return {
    ...normalized,
    client_id: item.client_id,
    review_acknowledged: normalized.issues.length ? false : item.review_acknowledged,
  };
}

export function withShoppingDraftClientIds(items: z.infer<typeof VoiceShoppingDraftItemSchema>[]) {
  return items.map((item, index) => ({
    ...normalizeVoiceShoppingDraftItem(item),
    client_id: `shopping-draft-${Date.now().toString(36)}-${index}`,
  }));
}

export function getVoiceShoppingDraftReadiness(item: VoiceShoppingDraftItem) {
  const normalized = normalizeVoiceShoppingDraftItem(item);
  const structuralIssues: VoiceShoppingDraftIssue[] = [
    "quantity-missing",
    "unit-missing",
    "package-size-missing",
    "ambiguous-product",
  ];
  const structuralReady = Boolean(normalized.name.trim())
    && normalized.quantity !== null
    && normalized.quantity > 0
    && normalized.unit !== null
    && !normalized.issues.some((issue) => structuralIssues.includes(issue));
  const requiresReview = normalized.issues.some((issue) => !structuralIssues.includes(issue));
  const reviewReady = !requiresReview || Boolean(item.review_acknowledged);

  return { structuralReady, requiresReview, reviewReady, saveReady: structuralReady && reviewReady };
}

export function getVoiceShoppingDraftStatus(item: VoiceShoppingDraftItem) {
  const readiness = getVoiceShoppingDraftReadiness(item);
  if (!readiness.structuralReady) return "Incompleto";
  return readiness.requiresReview ? "Necesita revisión" : "Listo";
}
