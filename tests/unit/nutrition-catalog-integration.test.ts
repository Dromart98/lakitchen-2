import { describe, expect, it, vi } from "vitest";
import { resolveInventoryNutritionForUser } from "@/lib/nutrition/catalog-resolver";
import { applyNutritionCatalogToVoiceBatch } from "@/modules/inventory/voice-inventory-catalog";
import type { NutritionCatalogRow } from "@/modules/nutrition/catalog";

const catalogRow = (values: Partial<NutritionCatalogRow> = {}): NutritionCatalogRow => ({
  user_id: "user-a", normalized_name: "pechuga de pollo cruda", aliases: [], food_state: "raw", nutrition_basis: "per_100g",
  calories: 111, protein_g: 24, carbs_g: 0, fat_g: 1.5, source: "user", external_id: null,
  match_confidence: "high", user_confirmed: true, verified: true, resolved_at: new Date().toISOString(), ...values,
});

function catalogClient(rows: NutritionCatalogRow[]) {
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
  })) };
  return { client, reads: () => reads };
}

const voiceItem = (name: string) => ({ client_id: name, name, quantity: 1, unit: "kg" as const, location: "freezer" as const,
  category: "protein" as const, food_state: "raw" as const, nutrition_basis: "per_100g" as const,
  calories: 999, protein_g: 1, carbs_g: 2, fat_g: 3, confidence: "medium" as const, nutrition_assumptions: "Estimación revisable.",
  package_count: null, package_size: null, package_size_unit: null, total_size: null, total_size_unit: null, issues: [] });

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
});
