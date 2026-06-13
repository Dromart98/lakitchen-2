import { calculateMacroGoals } from "@/modules/nutrition/macro-calculator";
import { NextResponse } from "next/server";
import { z } from "zod";
const schema = z.object({ age: z.number().int().min(13).max(100), sex: z.enum(["male", "female", "other"]), weightKg: z.number().positive(), heightCm: z.number().positive(), activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]), goal: z.enum(["fat_loss", "maintenance", "muscle_gain"]), proteinPct: z.number().optional(), carbsPct: z.number().optional(), fatPct: z.number().optional() });
export async function POST(request: Request) { const body = schema.parse(await request.json()); return NextResponse.json(calculateMacroGoals(body)); }
