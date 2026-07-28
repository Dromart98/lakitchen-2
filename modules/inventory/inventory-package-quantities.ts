import {
  convertFoodQuantity,
  getFoodQuantityUnitDefinition,
  type FoodQuantityDimension,
  type FoodQuantityUnit,
} from "@/modules/units/food-quantity";

export const PACKAGE_SIZE_UNITS = ["g", "kg", "ml", "l"] as const;
export type PackageSizeUnit = Exclude<FoodQuantityUnit, "ud">;
export type PackageDimension = Exclude<FoodQuantityDimension, "units">;

export type PackageFacts = {
  package_count: number | null;
  package_size: number | null;
  package_size_unit: PackageSizeUnit | null;
  total_size: number | null;
  total_size_unit: PackageSizeUnit | null;
};

export type ResolvedPackageQuantity = PackageFacts & {
  dimension: PackageDimension;
  derived_unit_size: number;
  derived_unit_size_unit: "g" | "ml";
  calculated_total_size: number;
  calculated_total_size_unit: "g" | "ml" | "l";
};

function getPackageUnitDefinition(unit: PackageSizeUnit) {
  return getFoodQuantityUnitDefinition(unit)! as ReturnType<typeof getFoodQuantityUnitDefinition> & {
    dimension: PackageDimension;
    canonicalUnit: "g" | "ml";
  };
}

export function convertPackageSize(value: number, from: PackageSizeUnit, to: PackageSizeUnit): number | null {
  return convertFoodQuantity(value, from, to);
}

/** Resolves observed package facts. It never supplies an unobserved weight or volume. */
export function resolvePackageQuantity(facts: PackageFacts): ResolvedPackageQuantity | null {
  if (!facts.package_count || !Number.isFinite(facts.package_count) || facts.package_count <= 0) return null;
  const count = facts.package_count;
  const individual = facts.package_size !== null && facts.package_size_unit
    ? convertPackageSize(facts.package_size, facts.package_size_unit, getPackageUnitDefinition(facts.package_size_unit).canonicalUnit)
    : null;
  const total = facts.total_size !== null && facts.total_size_unit
    ? convertPackageSize(facts.total_size, facts.total_size_unit, getPackageUnitDefinition(facts.total_size_unit).canonicalUnit)
    : null;
  if (individual === null && total === null) return null;
  if (individual !== null && total !== null) {
    const individualDefinition = getPackageUnitDefinition(facts.package_size_unit!);
    const totalDefinition = getPackageUnitDefinition(facts.total_size_unit!);
    if (individualDefinition.dimension !== totalDefinition.dimension) return null;
    const tolerance = Math.max(1, total) * Number.EPSILON * 8;
    if (Math.abs(individual * count - total) > tolerance) return null;
  }
  const definition = getPackageUnitDefinition(individual !== null ? facts.package_size_unit! : facts.total_size_unit!);
  const unitSize = individual ?? total! / count;
  const totalInBase = unitSize * count;
  const displayTotalAsLiters = definition.dimension === "volume" && totalInBase >= 1000;
  return {
    ...facts,
    dimension: definition.dimension,
    derived_unit_size: unitSize,
    derived_unit_size_unit: definition.canonicalUnit,
    calculated_total_size: displayTotalAsLiters ? totalInBase / 1000 : totalInBase,
    calculated_total_size_unit: displayTotalAsLiters ? "l" : definition.canonicalUnit,
  };
}

export function convertNutritionToPerUnit(
  nutrition: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null },
  basis: "per_100g" | "per_100ml",
  resolved: ResolvedPackageQuantity,
) {
  const compatible = (basis === "per_100g" && resolved.dimension === "mass") || (basis === "per_100ml" && resolved.dimension === "volume");
  if (!compatible) return null;
  const factor = resolved.derived_unit_size / 100;
  return {
    calories: nutrition.calories === null ? null : nutrition.calories * factor,
    protein_g: nutrition.protein_g === null ? null : nutrition.protein_g * factor,
    carbs_g: nutrition.carbs_g === null ? null : nutrition.carbs_g * factor,
    fat_g: nutrition.fat_g === null ? null : nutrition.fat_g * factor,
  };
}
