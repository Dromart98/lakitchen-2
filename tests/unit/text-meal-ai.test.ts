import { describe, expect, it } from "vitest";
import { calculateTextMealTotals, textMealRequestSchema, validateTextMealProviderOutput } from "@/modules/meals/text-meal-ai";

const ingredient = { name: "Pechuga de pollo", quantity: 240, unit: "g", preparation: "a la plancha", calories: 396, protein_g: 74.4, carbs_g: 0, fat_g: 8.6 };
const success = () => ({ status: "success", suggested_name: "Pollo con arroz", ingredients: [ingredient], assumptions: ["Se asumió cocinado sin salsa"], confidence: "high", message: null });
const clarification = () => ({ status: "needs-clarification", suggested_name: null, ingredients: null, assumptions: null, confidence: null, message: "No puedo estimar cuánto arroz se consumió aproximadamente." });
const rawChickenAndRice = () => ({ status: "success", suggested_name: "Pollo con arroz", ingredients: [
  { name: "Pollo", quantity: 200, unit: "g", preparation: "crudo", calories: 220, protein_g: 46, carbs_g: 0, fat_g: 2.6 },
  { name: "Arroz", quantity: 100, unit: "g", preparation: "crudo", calories: 360, protein_g: 7, carbs_g: 79, fat_g: 0.7 },
], assumptions: ["Se asumió pollo crudo al no indicarse preparación.", "Se asumió arroz crudo al no indicarse preparación."], confidence: "high", message: null });

describe("text meal AI validation", () => {
  it("validates input boundaries", () => { expect(textMealRequestSchema.safeParse({ description: "pollo" }).success).toBe(true); expect(textMealRequestSchema.safeParse({ description: "" }).success).toBe(false); expect(textMealRequestSchema.safeParse({ description: "ab" }).success).toBe(false); expect(textMealRequestSchema.safeParse({ description: "a".repeat(2001) }).success).toBe(false); });
  it("accepts and normalizes the complete Structured Output success shape", () => { expect(validateTextMealProviderOutput(success())).toEqual({ status: "success", suggested_name: "Pollo con arroz", ingredients: [ingredient], total: { calories: 396, protein_g: 74.4, carbs_g: 0, fat_g: 8.6 }, assumptions: ["Se asumió cocinado sin salsa"], confidence: "high" }); });
  it("accepts and normalizes the complete Structured Output clarification shape", () => { expect(validateTextMealProviderOutput(clarification())).toEqual({ status: "needs-clarification", message: clarification().message }); });
  it("accepts explicit quantities with the raw preparation default and recalculates their totals", () => {
    expect(validateTextMealProviderOutput(rawChickenAndRice())).toEqual(expect.objectContaining({
      status: "success",
      ingredients: expect.arrayContaining([expect.objectContaining({ name: "Pollo", preparation: "crudo" }), expect.objectContaining({ name: "Arroz", preparation: "crudo" })]),
      total: { calories: 580, protein_g: 53, carbs_g: 79, fat_g: 3.3 },
    }));
  });
  it("accepts normal approximate portions when their assumption and calibrated confidence are supplied", () => {
    const tomato = { status: "success", suggested_name: "Tomate", ingredients: [{ name: "Tomate", quantity: 90, unit: "g", preparation: "crudo", calories: 16, protein_g: 0.8, carbs_g: 3.5, fat_g: 0.2 }], assumptions: ["Se estimó un tomate pequeño como aproximadamente 90 g y crudo."], confidence: "medium", message: null };
    expect(validateTextMealProviderOutput(tomato)).toEqual(expect.objectContaining({ status: "success", confidence: "medium", assumptions: tomato.assumptions }));
  });
  it("preserves explicit cooked preparation over the raw default", () => {
    const cooked = rawChickenAndRice();
    cooked.ingredients[0].preparation = "cocinado";
    cooked.ingredients[1].preparation = "cocido";
    expect(validateTextMealProviderOutput(cooked)).toEqual(expect.objectContaining({ status: "success", ingredients: expect.arrayContaining([expect.objectContaining({ preparation: "cocinado" }), expect.objectContaining({ preparation: "cocido" })]) }));
  });
  it("supports a reasonable egg and serrano ham estimate while retaining clarification for an unquantified meal", () => {
    const eggAndHam = { status: "success", suggested_name: "Huevo con jamón serrano", ingredients: [{ name: "Huevo L", quantity: 1, unit: "unidad", preparation: "crudo", calories: 78, protein_g: 6.9, carbs_g: 0.4, fat_g: 5.3 }, { name: "Jamón serrano", quantity: 2, unit: "lonchas", preparation: null, calories: 54, protein_g: 8.4, carbs_g: 0, fat_g: 2.3 }], assumptions: ["Se estimó un huevo L como una unidad y dos lonchas normales de jamón serrano."], confidence: "medium", message: null };
    expect(validateTextMealProviderOutput(eggAndHam).status).toBe("success");
    expect(validateTextMealProviderOutput({ ...clarification(), message: "Indica una cantidad aproximada de pollo o arroz para poder estimar pollo con arroz." })).toEqual({ status: "needs-clarification", message: "Indica una cantidad aproximada de pollo o arroz para poder estimar pollo con arroz." });
  });
  it("rejects incompatible status field combinations and additional properties", () => { const invalid = [{ ...success(), message: "No nulo" }, { ...success(), ingredients: null }, { ...success(), confidence: null }, { ...success(), suggested_name: null }, { ...clarification(), message: null }, { ...clarification(), ingredients: [ingredient] }, { ...clarification(), suggested_name: "Nombre" }, { ...clarification(), assumptions: ["Suposición"] }, { ...clarification(), confidence: "low" }, { ...success(), extra: true }]; for (const value of invalid) expect(validateTextMealProviderOutput(value)).toEqual({ status: "error", code: "invalid-ai-response" }); });
  it("rejects invalid ingredients and oversized totals", () => { for (const change of [{ quantity: 0 }, { quantity: -1 }, { calories: -1 }, { name: "" }, { unit: "" }, { unit: "vago" }, { quantity: Infinity }]) expect(validateTextMealProviderOutput({ ...success(), ingredients: [{ ...ingredient, ...change }] })).toEqual({ status: "error", code: "invalid-ai-response" }); expect(validateTextMealProviderOutput({ ...success(), ingredients: Array.from({ length: 21 }, () => ingredient) })).toEqual({ status: "error", code: "invalid-ai-response" }); expect(calculateTextMealTotals([{ ...ingredient, calories: 0.04, protein_g: 0.04, carbs_g: 0.04, fat_g: 0.04 }, { ...ingredient, calories: 0.05, protein_g: 0.05, carbs_g: 0.05, fat_g: 0.05 }])).toEqual({ calories: 0.1, protein_g: 0.1, carbs_g: 0.1, fat_g: 0.1 }); expect(calculateTextMealTotals([{ ...ingredient, calories: 5001 }, { ...ingredient, calories: 5001 }])).toBeNull(); });
});
