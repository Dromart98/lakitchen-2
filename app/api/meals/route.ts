import { consumedToday, todayGoal } from "@/lib/demo-data";
import { remainingMacros } from "@/modules/meals/meal-summary";
import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ date: new Date().toISOString().slice(0,10), consumed: consumedToday, goal: todayGoal, remaining: remainingMacros(todayGoal, consumedToday), meals: [] }); }
