import { describe, expect, it } from "vitest";
import { convertNutritionToPerUnit, resolvePackageQuantity } from "@/modules/inventory/inventory-package-quantities";

const facts = (overrides = {}) => ({ package_count: 3, package_size: 143, package_size_unit: "g" as const, total_size: null, total_size_unit: null, ...overrides });
describe("inventory package quantities", () => {
  it("calculates individual mass totals in base units", () => {
    expect(resolvePackageQuantity(facts())).toMatchObject({ derived_unit_size: 143, calculated_total_size: 429, calculated_total_size_unit: "g" });
    expect(resolvePackageQuantity(facts({ package_size: 0.143, package_size_unit: "kg" }))).toMatchObject({ derived_unit_size: 143, calculated_total_size: 429 });
  });
  it("derives an unrounded individual size from an observed total", () => {
    expect(resolvePackageQuantity(facts({ package_count: 6, package_size: null, package_size_unit: null, total_size: 350, total_size_unit: "g" })))
      .toMatchObject({ derived_unit_size: 350 / 6, calculated_total_size: 350 });
  });
  it("converts liters and milliliters without converting volume to mass", () => {
    expect(resolvePackageQuantity(facts({ package_count: 2, package_size: 1, package_size_unit: "l" }))).toMatchObject({ derived_unit_size: 1000, calculated_total_size: 2, calculated_total_size_unit: "l" });
    expect(resolvePackageQuantity(facts({ package_count: 4, package_size: 500, package_size_unit: "ml" }))).toMatchObject({ calculated_total_size: 2, calculated_total_size_unit: "l" });
    expect(resolvePackageQuantity(facts({ package_size_unit: "g", total_size: 1, total_size_unit: "l" }))).toBeNull();
  });
  it("converts per-100 nutrition to per-unit deterministically", () => {
    const mass = resolvePackageQuantity(facts())!;
    expect(convertNutritionToPerUnit({ calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5 }, "per_100g", mass)).toEqual({ calories: 286, protein_g: 28.599999999999998, carbs_g: 14.299999999999999, fat_g: 7.1499999999999995 });
    const volume = resolvePackageQuantity(facts({ package_count: 2, package_size: 1, package_size_unit: "l" }))!;
    expect(convertNutritionToPerUnit({ calories: 46, protein_g: 3.2, carbs_g: 4.8, fat_g: 1.5 }, "per_100ml", volume)).toEqual({ calories: 460, protein_g: 32, carbs_g: 48, fat_g: 15 });
    expect(convertNutritionToPerUnit({ calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }, "per_100g", volume)).toBeNull();
  });
  it("rejects zero, negative, and missing sizes instead of inventing them", () => {
    expect(resolvePackageQuantity(facts({ package_count: 0 }))).toBeNull();
    expect(resolvePackageQuantity(facts({ package_count: -1 }))).toBeNull();
    expect(resolvePackageQuantity(facts({ package_size: null, package_size_unit: null }))).toBeNull();
  });
});
