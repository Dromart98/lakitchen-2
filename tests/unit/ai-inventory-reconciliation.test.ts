import { describe, expect, it } from "vitest";
import { convertEstimatedQuantity, normalizeInventoryMatchName, suggestInventoryMatch, validateAiInventoryLine } from "@/modules/meals/ai-inventory-reconciliation";
const item=(id:string,name:string)=>({id,name,quantity:2,unit:"kg",nutrition_basis:"per_100g" as const,calories:100,protein_g:10,carbs_g:0,fat_g:1});
describe("AI inventory reconciliation",()=>{
 it("normalizes accents and preparation and only proposes one clear item",()=>{expect(normalizeInventoryMatchName("Pollo a la plancha")).toBe("pollo");expect(suggestInventoryMatch("POLLO a la plancha",[item("a","pollo")])).toEqual({suggestedItemId:"a",ambiguous:false});});
 it("does not choose ambiguous or absent products",()=>{expect(suggestInventoryMatch("arroz",[item("a","arroz basmati"),item("b","arroz integral")])).toEqual({suggestedItemId:null,ambiguous:true});expect(suggestInventoryMatch("tomate",[])).toEqual({suggestedItemId:null,ambiguous:false});});
 it("only performs safe unit conversions",()=>{expect(convertEstimatedQuantity(1000,"g","kg")).toBe(1);expect(convertEstimatedQuantity(1,"kg","g")).toBe(1000);expect(convertEstimatedQuantity(1000,"ml","l")).toBe(1);expect(convertEstimatedQuantity(1,"l","ml")).toBe(1000);expect(convertEstimatedQuantity(2,"ud","ud")).toBe(2);expect(convertEstimatedQuantity(1,"g","ud")).toBeNull();expect(convertEstimatedQuantity(1,"ml","ud")).toBeNull();});
 it("rejects invalid quantities and stock overruns",()=>{const value=item("a","pollo");expect(validateAiInventoryLine(value,0)).toBeTruthy();expect(validateAiInventoryLine(value,3)).toBeTruthy();expect(validateAiInventoryLine(value,1)).toBeNull();});
});
