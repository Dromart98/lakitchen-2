import { describe, expect, it, vi } from "vitest";
import { resolveInventoryNutritionForUser } from "@/lib/nutrition/catalog-resolver";
import { applyNutritionCatalogToVoiceBatch } from "@/modules/inventory/voice-inventory-catalog";
import { confirmedCatalogRow, persistConfirmedNutritionBatch, persistNutritionCatalogRow, shouldReplaceCatalogRow, type NutritionCatalogRow } from "@/modules/nutrition/catalog";
import { buildVoiceInventoryBatchCatalogMetadata } from "@/modules/inventory/voice-inventory-batch-save";

const catalogRow = (values: Partial<NutritionCatalogRow> = {}): NutritionCatalogRow => ({
  user_id: "user-a", normalized_name: "pechuga de pollo cruda", aliases: [], food_state: "raw", nutrition_basis: "per_100g",
  calories: 111, protein_g: 24, carbs_g: 0, fat_g: 1.5, source: "user", external_id: null,
  match_confidence: "high", user_confirmed: true, verified: true, resolved_at: new Date().toISOString(), ...values,
  refresh_after: values.refresh_after === undefined ? null : values.refresh_after,
});

function catalogClient(initialRows: NutritionCatalogRow[]) {
  const rows = [...initialRows];
  const identities: Array<{ id: string; user_id: string; normalized_name: string; aliases: string[]; food_state: string; source: string; external_id: string | null; user_confirmed: boolean; display_name: string }> = [];
  let reads = 0;
  const client = { from: vi.fn(() => ({
    select: vi.fn(() => {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        eq(column: string, value: unknown) { filters[column] = value; return builder; },
        in(column: string, values: string[]) { reads += 1; return Promise.resolve({ data: rows.filter((row) => (!filters.user_id || row.user_id === filters.user_id) && values.includes((row as any)[column])), error: null }); },
        overlaps(column: string, values: string[]) { reads += 1; return Promise.resolve({ data: rows.filter((row) => (!filters.user_id || row.user_id === filters.user_id) && (row as any)[column].some((value: string) => values.includes(value))), error: null }); },
      };
      return builder;
    }),
  })), rpc: vi.fn(async (name: string, args: any) => {
    if (name === "resolve_or_create_food_catalog_item") {
      let identity = args.p_existing_food_catalog_item_id && identities.find((item) => item.id === args.p_existing_food_catalog_item_id && item.user_id === args.p_user_id);
      identity ??= args.p_external_id && identities.find((item) => item.user_id === args.p_user_id && item.food_state === args.p_food_state && item.source === args.p_identity_source && item.external_id === args.p_external_id);
      identity ??= identities.find((item) => item.user_id === args.p_user_id && item.food_state === args.p_food_state && item.normalized_name === args.p_normalized_name);
      const evidencedNames = [args.p_normalized_name, ...args.p_aliases];
      const aliasCandidates = identities.filter((item) => item.user_id === args.p_user_id && item.food_state === args.p_food_state
        && (args.p_aliases.includes(item.normalized_name) || item.aliases.some((alias) => evidencedNames.includes(alias)))
        && !(args.p_external_id && item.source === args.p_identity_source && item.external_id && item.external_id !== args.p_external_id));
      if (!identity && aliasCandidates.length === 1) identity = aliasCandidates[0];
      if (!identity) {
        identity = { id: `food-${identities.length + 1}`, user_id: args.p_user_id, normalized_name: args.p_normalized_name, aliases: args.p_aliases,
          food_state: args.p_food_state, source: args.p_identity_source, external_id: args.p_external_id, user_confirmed: args.p_user_confirmed, display_name: args.p_display_name };
        identities.push(identity);
      } else {
        identity.aliases = [...new Set([...identity.aliases, args.p_normalized_name, ...args.p_aliases])].filter((alias) => alias !== identity!.normalized_name);
        if (args.p_user_confirmed && !identity.user_confirmed) { identity.display_name = args.p_display_name; identity.source = args.p_identity_source; identity.user_confirmed = true; }
      }
      return { data: identity.id, error: null };
    }
    for (const incoming of args.p_items) {
      const index = rows.findIndex((row) => row.user_id === incoming.user_id && row.normalized_name === incoming.normalized_name && row.food_state === incoming.food_state && row.nutrition_basis === incoming.nutrition_basis);
      if (index < 0) rows.push(incoming); else if (shouldReplaceCatalogRow(rows[index], incoming)) rows[index] = incoming;
    }
    return { data: args.p_items.length, error: null };
  }) };
  const insertWithExactConflict = (incoming: (typeof identities)[number]) => {
    const existing = identities.find((item) => item.user_id === incoming.user_id && item.food_state === incoming.food_state && item.normalized_name === incoming.normalized_name);
    if (!existing) identities.push(incoming);
    else {
      existing.aliases = [...new Set([...existing.aliases, ...incoming.aliases])];
      if (incoming.user_confirmed && !existing.user_confirmed) { existing.display_name = incoming.display_name; existing.source = incoming.source; }
      existing.user_confirmed ||= incoming.user_confirmed;
    }
  };
  return { client, reads: () => reads, rows, identities, insertWithExactConflict };
}

const voiceItem = (name: string) => ({ client_id: name, name, quantity: 1, unit: "kg" as const, location: "freezer" as const,
  category: "protein" as const, food_state: "raw" as const, nutrition_basis: "per_100g" as const,
  calories: 999, protein_g: 1, carbs_g: 2, fat_g: 3, confidence: "medium" as const, nutrition_assumptions: "Estimación revisable.",
  package_count: null, package_measure_kind: null, package_size: null, package_size_unit: null, total_size: null, total_size_unit: null, issues: [] });

describe("catalog-first integrations", () => {
  it("returns a manual catalog hit without USDA or OpenAI calls", async () => {
    const { client } = catalogClient([catalogRow()]);
    const fetchImpl = vi.fn();
    const result = await resolveInventoryNutritionForUser(client, "user-a", { name: "Pechuga de pollo cruda", quantity: 1, unit: "kg", category: "protein" }, { usdaApiKey: "key", openAiApiKey: "key", fetchImpl });
    expect(result).toMatchObject({ status: "resolved", calories: 111, provenance: { source: "user" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deduplicates a 30-item voice batch into two bounded catalog reads and preserves order and misses", async () => {
    const items = Array.from({ length: 30 }, (_, index) => voiceItem(index % 2 ? "Pechuga de pollo cruda" : "Producto desconocido"));
    const { client, reads } = catalogClient([catalogRow()]);
    const result = await applyNutritionCatalogToVoiceBatch(client, "user-a", { status: "success", items });
    expect(reads()).toBe(2);
    expect(result.status).not.toBe("error");
    if (result.status !== "error") {
      expect(result.items).toHaveLength(30);
      expect(result.items.map((item) => item.name)).toEqual(items.map((item) => item.name));
      expect(result.items.filter((item) => item.name.startsWith("Pechuga")).every((item) => item.calories === 111)).toBe(true);
      expect(result.items.filter((item) => item.name.startsWith("Producto")).every((item) => item.calories === 999)).toBe(true);
    }
  });

  it("does not return another user's otherwise compatible catalog row", async () => {
    const { client } = catalogClient([catalogRow({ user_id: "user-b" })]);
    const result = await applyNutritionCatalogToVoiceBatch(client, "user-a", { status: "success", items: [voiceItem("Pechuga de pollo cruda")] });
    expect(result).toMatchObject({ items: [{ calories: 999 }] });
  });

  it("keeps aliases scoped to their owner", async () => {
    const alias = catalogRow({ normalized_name: "chicken breast raw", aliases: ["pechuga de pollo cruda"] });
    const owner = catalogClient([alias]);
    const other = catalogClient([alias]);
    const ownerResult = await applyNutritionCatalogToVoiceBatch(owner.client, "user-a", { status: "success", items: [voiceItem("Pechuga de pollo cruda")] });
    const otherResult = await applyNutritionCatalogToVoiceBatch(other.client, "user-b", { status: "success", items: [voiceItem("Pechuga de pollo cruda")] });
    expect(ownerResult).toMatchObject({ items: [{ calories: 111 }] });
    expect(otherResult).toMatchObject({ items: [{ calories: 999 }] });
  });

  it("caches an AI-selected USDA candidate and avoids every external call on the second resolution", async () => {
    const { client, rows } = catalogClient([]);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ foods: [{ fdcId: 41, description: "Rice, white, cooked", dataType: "Foundation" }, { fdcId: 42, description: "Rice, brown, cooked", dataType: "Foundation" }] }))
      .mockResolvedValueOnce(json({ status: "completed", output_text: JSON.stringify({ status: "selected", fdc_id: 42 }) }))
      .mockResolvedValueOnce(json({ fdcId: 42, description: "Rice, cooked", dataType: "Foundation", foodNutrients: [{ nutrient: { id: 2047 }, amount: 130 }, { nutrient: { id: 1003 }, amount: 2.7 }, { nutrient: { id: 1005 }, amount: 28 }, { nutrient: { id: 1004 }, amount: 0.3 }] }));
    const input = { name: "Arroz cocido", quantity: 100, unit: "g", category: "carbohydrate" } as const;
    const first = await resolveInventoryNutritionForUser(client, "user-a", input, { usdaApiKey: "usda", openAiApiKey: "openai", fetchImpl });
    expect(first).toMatchObject({ status: "resolved", provenance: { source: "usda", externalId: "42" } });
    expect(rows[0]).toMatchObject({ normalized_name: "arroz cocido", aliases: ["rice cooked"], external_id: "42" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const second = await resolveInventoryNutritionForUser(client, "user-a", input, { usdaApiKey: "usda", openAiApiKey: "openai", fetchImpl });
    expect(second).toMatchObject({ status: "resolved", provenance: { source: "usda" } });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reuses one identity for evidenced USDA aliases across nutrition bases", async () => {
    const { client, rows, identities } = catalogClient([]);
    const first = catalogRow({ normalized_name: "arroz cocido", aliases: ["rice cooked"], food_state: "cooked", source: "usda", external_id: "123", user_confirmed: false, refresh_after: new Date(Date.now() + 10_000).toISOString() });
    const second = { ...first, normalized_name: "arroz hervido", aliases: ["rice cooked"], nutrition_basis: "per_unit" as const };
    await Promise.all([persistNutritionCatalogRow(client, first), persistNutritionCatalogRow(client, second)]);
    expect(identities).toHaveLength(1);
    expect(identities[0].aliases).toEqual(expect.arrayContaining(["arroz hervido", "rice cooked"]));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((item) => item.food_catalog_item_id))).toEqual(new Set(["food-1"]));
  });

  it("does not merge different USDA IDs solely through a shared alias", async () => {
    const { client, identities } = catalogClient([]);
    const automatic = (name: string, externalId: string) => catalogRow({ normalized_name: name, aliases: ["chicken raw"], food_state: "raw", source: "usda", external_id: externalId, user_confirmed: false, refresh_after: new Date(Date.now() + 10_000).toISOString() });
    await persistNutritionCatalogRow(client, automatic("pollo", "A"));
    await persistNutritionCatalogRow(client, automatic("pechuga de pollo", "B"));
    expect(identities).toHaveLength(2);
    expect(identities.map((item) => item.external_id)).toEqual(["A", "B"]);
  });

  it("does not select an arbitrary identity when an alias is ambiguous", async () => {
    const { client, identities } = catalogClient([]);
    const automatic = (name: string, externalId: string | null, alias: string) => catalogRow({ normalized_name: name, aliases: [alias], food_state: "raw", source: "usda", external_id: externalId, user_confirmed: false, refresh_after: new Date(Date.now() + 10_000).toISOString() });
    await persistNutritionCatalogRow(client, automatic("pollo", "A", "ave habitual"));
    await persistNutritionCatalogRow(client, automatic("pavo", "B", "ave habitual"));
    await persistNutritionCatalogRow(client, automatic("ave para caldo", null, "ave habitual"));
    expect(identities).toHaveLength(3);
    expect(identities[2]).toMatchObject({ normalized_name: "ave para caldo" });
  });

  it.each(["automatic-first", "user-first"] as const)("preserves user authority through an exact ON CONFLICT race: %s", (order) => {
    const { identities, insertWithExactConflict } = catalogClient([]);
    const automatic = { id: "automatic", user_id: "user-a", normalized_name: "arroz", aliases: [], food_state: "raw", source: "usda", external_id: "123", user_confirmed: false, display_name: "Rice" };
    const confirmed = { ...automatic, id: "confirmed", source: "user", external_id: null, user_confirmed: true, display_name: "Mi arroz" };
    for (const identity of order === "automatic-first" ? [automatic, confirmed] : [confirmed, automatic]) insertWithExactConflict(identity);
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({ display_name: "Mi arroz", source: "user", user_confirmed: true });
  });

  it("keeps states, external foods, and users as distinct identities", async () => {
    const { client, identities } = catalogClient([]);
    const automatic = (name: string, state: "raw" | "cooked", externalId: string, user = "user-a") =>
      catalogRow({ user_id: user, normalized_name: name, food_state: state, source: "usda", external_id: externalId, user_confirmed: false, refresh_after: new Date(Date.now() + 10_000).toISOString() });
    await persistNutritionCatalogRow(client, automatic("arroz", "raw", "rice"));
    await persistNutritionCatalogRow(client, automatic("arroz", "cooked", "rice"));
    await persistNutritionCatalogRow(client, automatic("pollo", "raw", "A"));
    await persistNutritionCatalogRow(client, automatic("pechuga de pollo", "raw", "B"));
    await persistNutritionCatalogRow(client, automatic("arroz", "raw", "rice", "user-b"));
    expect(identities).toHaveLength(5);
  });

  it("preserves a user-confirmed display name when automatic evidence arrives", async () => {
    const { client, identities } = catalogClient([]);
    await persistNutritionCatalogRow(client, confirmedCatalogRow({ userId: "user-a", name: "Mi arroz habitual", unit: "g", foodState: "cooked", nutritionBasis: "per_100g", calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }));
    const identity = identities[0];
    await persistNutritionCatalogRow(client, catalogRow({ normalized_name: "arroz blanco cocido", aliases: ["mi arroz habitual"], food_state: "cooked", source: "usda", external_id: "123", user_confirmed: false, refresh_after: new Date(Date.now() + 10_000).toISOString() }));
    expect(identities).toHaveLength(1);
    expect(identity).toMatchObject({ display_name: "Mi arroz habitual", source: "user", user_confirmed: true });
    expect(identity.aliases).toContain("arroz blanco cocido");
  });

  it("does not lose valid nutrition when identity resolution fails", async () => {
    const { client, rows } = catalogClient([]);
    client.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "identity unavailable" } }) as any);
    await expect(persistNutritionCatalogRow(client, catalogRow())).resolves.toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].food_catalog_item_id).toBeNull();
  });

  it("keeps a reviewed raw state for Arroz and reuses it in the next voice batch", async () => {
    const draft = voiceItem("Arroz");
    const metadata = buildVoiceInventoryBatchCatalogMetadata([draft]);
    expect(metadata).toMatchObject({ success: true, data: [{ name: "Arroz", food_state: "raw" }] });
    const { client, rows } = catalogClient([]);
    await persistConfirmedNutritionBatch(client, [confirmedCatalogRow({ userId: "user-a", name: "Arroz", unit: "kg", foodState: "raw", nutritionBasis: "per_100g", calories: 360, proteinG: 7, carbsG: 80, fatG: 1 })]);
    expect(rows[0]).toMatchObject({ normalized_name: "arroz", food_state: "raw", source: "user" });
    const result = await applyNutritionCatalogToVoiceBatch(client, "user-a", { status: "success", items: [{ ...draft, calories: 999 }] });
    expect(result).toMatchObject({ items: [{ name: "Arroz", food_state: "raw", calories: 360 }] });
  });

  it("atomically preserves a user correction when an older automatic write finishes later", async () => {
    const automatic = catalogRow({ source: "usda", user_confirmed: false, refresh_after: new Date(Date.now() + 100_000).toISOString(), calories: 130 });
    const confirmed = confirmedCatalogRow({ userId: "user-a", name: "Pechuga de pollo cruda", unit: "kg", foodState: "raw", nutritionBasis: "per_100g", calories: 115, proteinG: 25, carbsG: 0, fatG: 1 });
    const { client, rows } = catalogClient([]);
    await persistConfirmedNutritionBatch(client, [confirmed]);
    await persistNutritionCatalogRow(client, automatic);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "user", user_confirmed: true, calories: 115 });
  });

  it("replaces expired USDA with fresh AI and uses the refreshed cache next time", async () => {
    const expired = catalogRow({ normalized_name: "arroz cocido", food_state: "cooked", source: "usda", user_confirmed: false, refresh_after: new Date(Date.now() - 1_000).toISOString() });
    const { client, rows } = catalogClient([expired]);
    const aiOutput = { status: "estimated", nutrition_basis: "per_100g", calories: 129, protein_g: 2.6, carbs_g: 27.8, fat_g: 0.3, confidence: "medium", food_state: "cooked", normalized_food_name: "Arroz cocido", assumptions: "Arroz cocido típico.", clarification: null };
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(json({ status: "completed", output_text: JSON.stringify(aiOutput) }));
    const input = { name: "Arroz cocido", quantity: 100, unit: "g", category: "carbohydrate" } as const;
    await expect(resolveInventoryNutritionForUser(client, "user-a", input, { usdaApiKey: "usda", openAiApiKey: "openai", fetchImpl })).resolves.toMatchObject({ status: "resolved", provenance: { source: "ai" } });
    expect(rows[0]).toMatchObject({ source: "ai", calories: 129 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(resolveInventoryNutritionForUser(client, "user-a", input, { usdaApiKey: "usda", openAiApiKey: "openai", fetchImpl })).resolves.toMatchObject({ status: "resolved", provenance: { source: "ai" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
