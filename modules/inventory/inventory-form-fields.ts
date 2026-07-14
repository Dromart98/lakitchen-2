export const INVENTORY_ADD_FORM_FIELD_IDS = {
  barcode: "inventory-barcode",
  name: "inventory-name",
  quantity: "inventory-quantity",
  unit: "inventory-unit",
  location: "inventory-location",
  category: "inventory-category",
  expiresAt: "inventory-expires-at",
  nutritionBasis: "inventory-nutrition-basis",
  calories: "inventory-calories",
  proteinG: "inventory-protein-g",
  carbsG: "inventory-carbs-g",
  fatG: "inventory-fat-g",
} as const;

export const INVENTORY_BARCODE_AUTOFILL_FIELD_IDS = [
  INVENTORY_ADD_FORM_FIELD_IDS.name,
  INVENTORY_ADD_FORM_FIELD_IDS.quantity,
  INVENTORY_ADD_FORM_FIELD_IDS.unit,
  INVENTORY_ADD_FORM_FIELD_IDS.location,
  INVENTORY_ADD_FORM_FIELD_IDS.category,
  INVENTORY_ADD_FORM_FIELD_IDS.nutritionBasis,
  INVENTORY_ADD_FORM_FIELD_IDS.calories,
  INVENTORY_ADD_FORM_FIELD_IDS.proteinG,
  INVENTORY_ADD_FORM_FIELD_IDS.carbsG,
  INVENTORY_ADD_FORM_FIELD_IDS.fatG,
] as const;
