import { describe, expect, it } from "vitest";
import { inferCatalogFoodState, isCatalogRowFresh, normalizeNutritionCatalogName, selectCatalogMatch, shouldReplaceCatalogRow, type NutritionCatalogRow } from "@/modules/nutrition/catalog";

const row = (values: Partial<NutritionCatalogRow> = {}): NutritionCatalogRow => ({
  user_id: "user-a", normalized_name: "pechuga de pollo", aliases: [], food_state: "raw", nutrition_basis: "per_100g",
  calories: 120.5, protein_g: 23.2, carbs_g: 0, fat_g: 2.1, source: "usda", external_id: "123",
  match_confidence: "high", user_confirmed: false, verified: true, resolved_at: new Date().toISOString(), ...values,
});

describe("nutrition catalog domain", () => {
  it("normalizes accents, case, punctuation and whitespace without aggressive equivalences", () => {
    expect(normalizeNutritionCatalogName("  PÉCHUGA, de   Pollo! ")).toBe("pechuga de pollo");
    expect(normalizeNutritionCatalogName("pollo")).not.toBe(normalizeNutritionCatalogName("pollo fresco"));
    expect(inferCatalogFoodState("Pechuga de pollo cruda")).toBe("raw");
    expect(inferCatalogFoodState("Arroz cocido")).toBe("cooked");
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
    const confirmed = row({ source: "user", user_confirmed: true });
    expect(shouldReplaceCatalogRow(confirmed, row({ source: "usda" }))).toBe(false);
    expect(shouldReplaceCatalogRow(row({ source: "ai" }), row({ source: "usda" }))).toBe(true);
    expect(shouldReplaceCatalogRow(row({ source: "usda" }), row({ source: "ai" }))).toBe(false);
    expect(shouldReplaceCatalogRow(confirmed, row({ source: "user", user_confirmed: true, calories: 125 }))).toBe(true);
  });

  it("never expires confirmations and expires AI sooner than USDA", () => {
    const now = Date.now();
    const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCatalogRowFresh(row({ source: "user", user_confirmed: true, resolved_at: twentyDaysAgo }), now)).toBe(true);
    expect(isCatalogRowFresh(row({ source: "ai", resolved_at: twentyDaysAgo }), now)).toBe(false);
    expect(isCatalogRowFresh(row({ source: "usda", resolved_at: twentyDaysAgo }), now)).toBe(true);
  });
});
