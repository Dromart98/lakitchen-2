import { getInventoryNutritionFoodStateExpectation } from "@/modules/inventory/inventory-ai-nutrition";

export const INVENTORY_VOICE_DEFAULT_RAW_FOODS = [
  "pechuga de pollo",
  "pechuga de pavo",
  "carne de ternera",
  "carne picada",
  "pollo",
  "pavo",
  "ternera",
  "cerdo",
  "solomillo",
  "merluza",
  "salmón",
  "tilapia",
  "bacalao",
  "pescado",
  "gambas",
  "langostinos",
  "pasta",
  "macarrones",
  "espaguetis",
  "arroz",
  "quinoa",
  "cuscús",
  "avena",
  "lentejas",
  "garbanzos",
  "alubias",
  "brócoli",
  "espinacas",
  "calabacín",
  "zanahoria",
  "pimiento",
  "cebolla",
  "papa",
  "patata",
  "huevo",
] as const;

export const INVENTORY_VOICE_DEFAULT_RAW_EXCLUSIONS = [
  "pasta fresca",
  "pasta con",
  "pasta de",
  "arroz con",
  "ensalada de arroz",
  "plato preparado",
] as const;

export function buildInventoryDefaultRawFoodPromptInstruction() {
  return `Cuando el usuario no indique una preparación, trata como raw únicamente ingredientes básicos simples o variedades simples de esta lista y usa valores del alimento sin cocinar: ${INVENTORY_VOICE_DEFAULT_RAW_FOODS.join(", ")}. No apliques esta regla a platos compuestos ni a estas exclusiones: ${INVENTORY_VOICE_DEFAULT_RAW_EXCLUSIONS.join(", ")}. Una preparación explícita como cocido, hervido, frito, asado o a la plancha prevalece. No supongas que arroz, pasta seca o legumbres secas están cocinados.`;
}

export function inventoryVoiceDefaultRawFoodsMatchDeterministicRules() {
  return INVENTORY_VOICE_DEFAULT_RAW_FOODS.every(
    (name) => getInventoryNutritionFoodStateExpectation(name)?.state === "raw",
  ) && INVENTORY_VOICE_DEFAULT_RAW_EXCLUSIONS.every(
    (name) => getInventoryNutritionFoodStateExpectation(name)?.state !== "raw",
  );
}
