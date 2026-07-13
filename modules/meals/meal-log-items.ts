export type MealLogItemRecord = {
  id?: string;
  meal_log_id?: string;
  source_inventory_item_id: string;
  product_name: string;
  consumed_quantity: number | string | null;
  unit: string;
  nutrition_basis?: string;
  calories: number | string | null;
  protein_g: number | string | null;
  carbs_g: number | string | null;
  fat_g: number | string | null;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
});

export function formatMealLogItemNutritionValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) return "—";

  return NUMBER_FORMATTER.format(numericValue);
}

export function sortMealLogItems<T extends Pick<MealLogItemRecord, "product_name" | "source_inventory_item_id">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const nameComparison = a.product_name.localeCompare(b.product_name, "es", {
      sensitivity: "base",
      numeric: true,
    });

    if (nameComparison !== 0) return nameComparison;

    return a.source_inventory_item_id.localeCompare(b.source_inventory_item_id);
  });
}
