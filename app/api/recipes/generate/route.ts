import { inventory } from "@/lib/demo-data";
import { generateRecipe } from "@/modules/recipes/recipe-generator.service";
import { NextResponse } from "next/server";
import { z } from "zod";
const schema = z.object({ mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]), macroTarget: z.object({ calories: z.number().optional(), proteinG: z.number().optional(), carbsG: z.number().optional(), fatG: z.number().optional() }).default({}), servings: z.number().int().positive().default(1), avoid: z.array(z.string()).default([]) });
export async function POST(request: Request) { const body = schema.parse(await request.json()); return NextResponse.json(generateRecipe({ items: inventory, ...body })); }
