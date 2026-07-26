export const PACKAGE_SIZE_UNITS = ["g", "kg", "ml", "l"] as const;
export type PackageSizeUnit = (typeof PACKAGE_SIZE_UNITS)[number];
export type PackageDimension = "mass" | "volume";

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

function unitDefinition(unit: PackageSizeUnit) {
  if (unit === "g") return { dimension: "mass" as const, baseUnit: "g" as const, factor: 1 };
  if (unit === "kg") return { dimension: "mass" as const, baseUnit: "g" as const, factor: 1000 };
  if (unit === "ml") return { dimension: "volume" as const, baseUnit: "ml" as const, factor: 1 };
  return { dimension: "volume" as const, baseUnit: "ml" as const, factor: 1000 };
}

export function convertPackageSize(value: number, from: PackageSizeUnit, to: PackageSizeUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const source = unitDefinition(from);
  const target = unitDefinition(to);
  return source.dimension === target.dimension ? value * source.factor / target.factor : null;
}

/** Resolves observed package facts. It never supplies an unobserved weight or volume. */
export function resolvePackageQuantity(facts: PackageFacts): ResolvedPackageQuantity | null {
  if (!facts.package_count || !Number.isFinite(facts.package_count) || facts.package_count <= 0) return null;
  const count = facts.package_count;
  const individual = facts.package_size !== null && facts.package_size_unit
    ? convertPackageSize(facts.package_size, facts.package_size_unit, unitDefinition(facts.package_size_unit).baseUnit)
    : null;
  const total = facts.total_size !== null && facts.total_size_unit
    ? convertPackageSize(facts.total_size, facts.total_size_unit, unitDefinition(facts.total_size_unit).baseUnit)
    : null;
  if (individual === null && total === null) return null;
  if (individual !== null && total !== null) {
    const individualDefinition = unitDefinition(facts.package_size_unit!);
    const totalDefinition = unitDefinition(facts.total_size_unit!);
    if (individualDefinition.dimension !== totalDefinition.dimension) return null;
  }
  const definition = individual !== null ? unitDefinition(facts.package_size_unit!) : unitDefinition(facts.total_size_unit!);
  const unitSize = individual ?? total! / count;
  const totalInBase = unitSize * count;
  const displayTotalAsLiters = definition.dimension === "volume" && totalInBase >= 1000;
  return {
    ...facts,
    dimension: definition.dimension,
    derived_unit_size: unitSize,
    derived_unit_size_unit: definition.baseUnit,
    calculated_total_size: displayTotalAsLiters ? totalInBase / 1000 : totalInBase,
    calculated_total_size_unit: displayTotalAsLiters ? "l" : definition.baseUnit,
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
