import { describe, expect, it } from "vitest";
import { inferCatalogFoodState, isCatalogRowFresh, normalizeNutritionCatalogName, selectCatalogMatch, shouldReplaceCatalogRow, type NutritionCatalogRow } from "@/modules/nutrition/catalog";

const row = (values: Partial<NutritionCatalogRow> = {}): NutritionCatalogRow => ({
  user_id: "user-a", normalized_name: "pechuga de pollo", aliases: [], food_state: "raw", nutrition_basis: "per_100g",
  calories: 120.5, protein_g: 23.2, carbs_g: 0, fat_g: 2.1, source: "usda", external_id: "123",
  match_confidence: "high", user_confirmed: false, verified: true, resolved_at: new Date().toISOString(), ...values,
  refresh_after: values.refresh_after === undefined ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : values.refresh_after,
});

describe("nutrition catalog domain", () => {
  it("normalizes accents, case, punctuation and whitespace without aggressive equivalences", () => {
    expect(normalizeNutritionCatalogName("  PÉCHUGA, de   Pollo! ")).toBe("pechuga de pollo");
    expect(normalizeNutritionCatalogName("pollo")).not.toBe(normalizeNutritionCatalogName("pollo fresco"));
    expect(inferCatalogFoodState("Pechuga de pollo cruda")).toBe("raw");
    expect(inferCatalogFoodState("Arroz cocido")).toBe("cooked");
    expect(inferCatalogFoodState("Arroz")).toBe("raw");
    expect(inferCatalogFoodState("Pechuga de pollo")).toBe("raw");
    expect(inferCatalogFoodState("Pollo asado")).toBe("cooked");
    expect(inferCatalogFoodState("Jamón")).toBe("processed");
    expect(inferCatalogFoodState("Queso")).toBe("processed");
  });

  it("matches exact names and evidenced aliases only with compatible state and basis", () => {
    const aliased = row({ aliases: ["pollo para ensalada"] });
    expect(selectCatalogMatch([aliased], "PÉCHUGA DE POLLO", "raw", "per_100g")).toBe(aliased);
    expect(selectCatalogMatch([aliased], "pollo para ensalada", "raw", "per_100g")).toBe(aliased);
    expect(selectCatalogMatch([aliased], "pechuga de pollo", "cooked", "per_100g")).toBeNull();
    expect(selectCatalogMatch([aliased], "pechuga de pollo", "raw", "per_unit")).toBeNull();
    expect(selectCatalogMatch([aliased], "pollo", "raw", "per_100g")).toBeNull();
  });

  it("keeps user confirmation above automatic data and permits higher automatic authority", () => {
    const confirmed = row({ source: "user", user_confirmed: true, refresh_after: null });
    expect(shouldReplaceCatalogRow(confirmed, row({ source: "usda" }))).toBe(false);
    expect(shouldReplaceCatalogRow(row({ source: "ai" }), row({ source: "usda" }))).toBe(true);
    expect(shouldReplaceCatalogRow(row({ source: "usda" }), row({ source: "ai" }))).toBe(false);
    expect(shouldReplaceCatalogRow(row({ source: "usda" }), row({ source: "open-food-facts" }))).toBe(true);
    expect(shouldReplaceCatalogRow(row({ source: "open-food-facts" }), row({ source: "usda" }))).toBe(false);
    expect(shouldReplaceCatalogRow(confirmed, row({ source: "user", user_confirmed: true, calories: 125, refresh_after: null }))).toBe(true);
    expect(shouldReplaceCatalogRow(confirmed, row({ source: "barcode-memory", user_confirmed: true, refresh_after: null }))).toBe(false);
    expect(shouldReplaceCatalogRow(row({ source: "barcode-memory", user_confirmed: true, refresh_after: null }), confirmed)).toBe(true);
  });

  it("never expires confirmations and expires AI sooner than USDA", () => {
    const now = Date.now();
    const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCatalogRowFresh(row({ source: "user", user_confirmed: true, resolved_at: twentyDaysAgo, refresh_after: null }), now)).toBe(true);
    expect(isCatalogRowFresh(row({ source: "ai", resolved_at: twentyDaysAgo, refresh_after: new Date(now - 1).toISOString() }), now)).toBe(false);
    expect(isCatalogRowFresh(row({ source: "usda", resolved_at: twentyDaysAgo, refresh_after: new Date(now + 1).toISOString() }), now)).toBe(true);
    expect(shouldReplaceCatalogRow(row({ source: "usda", refresh_after: new Date(now - 1).toISOString() }), row({ source: "ai" }), now)).toBe(true);
  });

  it("preserves an explicit reviewed state before deterministic inference", async () => {
    const { confirmedCatalogRow } = await import("@/modules/nutrition/catalog");
    expect(confirmedCatalogRow({ userId: "a", name: "Arroz", unit: "kg", foodState: "not_applicable", nutritionBasis: "per_100g", calories: 1, proteinG: 1, carbsG: 1, fatG: 1 }).food_state).toBe("not_applicable");
    expect(confirmedCatalogRow({ userId: "a", name: "Arroz", unit: "kg", foodState: "raw", nutritionBasis: "per_100g", calories: 1, proteinG: 1, carbsG: 1, fatG: 1 }).food_state).toBe("raw");
  });
});
