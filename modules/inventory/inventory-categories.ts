export const INVENTORY_CATEGORIES = [
  "protein",
  "carbohydrate",
  "vegetable",
  "fruit",
  "fat",
  "dairy",
  "legume",
  "condiment",
  "beverage",
  "other",
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  protein: "Proteína",
  carbohydrate: "Carbohidrato",
  vegetable: "Verdura",
  fruit: "Fruta",
  fat: "Grasa",
  dairy: "Lácteo",
  legume: "Legumbre",
  condiment: "Condimento",
  beverage: "Bebida",
  other: "Otro",
};

export function isInventoryCategory(value: unknown): value is InventoryCategory {
  return typeof value === "string" && INVENTORY_CATEGORIES.includes(value as InventoryCategory);
}

export function getInventoryCategoryLabel(category: InventoryCategory | null): string {
  return category ? INVENTORY_CATEGORY_LABELS[category] : "Sin categoría";
}
