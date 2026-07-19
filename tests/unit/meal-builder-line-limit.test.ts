import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_MEAL_BUILDER_LINES, parseMealBuilderConsumptionLines } from "@/modules/meals/meal-builder";
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const lines=(count:number)=>Array.from({length:count},(_,i)=>({item_id:uuid(i+1),consumed_quantity:i+1}));
describe("meal builder twenty-line limit",()=>{
 it("exports the shared twenty-line limit",()=>expect(MAX_MEAL_BUILDER_LINES).toBe(20));
 it.each([1,10,11,20])("accepts %i ordered valid parser lines",count=>{const result=parseMealBuilderConsumptionLines(JSON.stringify(lines(count)));expect("lines" in result && result.lines).toEqual(lines(count));});
 it("rejects twenty-one lines",()=>expect(parseMealBuilderConsumptionLines(JSON.stringify(lines(21)))).toEqual({error:"too-many-products"}));
 it("keeps parser validation",()=>{expect(parseMealBuilderConsumptionLines("[]")).toEqual({error:"invalid-lines"});expect(parseMealBuilderConsumptionLines(JSON.stringify([{item_id:"bad",consumed_quantity:1}]))).toEqual({error:"product-not-found"});expect(parseMealBuilderConsumptionLines(JSON.stringify([{item_id:uuid(1),consumed_quantity:0}]))).toEqual({error:"invalid-quantity"});});
 it("makes the inventory UI import the shared constant",()=>{const source=readFileSync(resolve(process.cwd(),"components/meals/InventoryMealBuilder.tsx"),"utf8");expect(source).toContain("MAX_MEAL_BUILDER_LINES");expect(source).not.toContain("MAX_MEAL_BUILDER_ROWS");});
});
