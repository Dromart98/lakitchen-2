import { inventory } from "@/lib/demo-data";
import { getExpiringItems } from "@/modules/inventory/inventory.rules";
import { NextResponse } from "next/server";
export async function GET(request: Request) { const { searchParams } = new URL(request.url); const expiring = searchParams.get("expiring"); const location = searchParams.get("location"); let data = expiring ? getExpiringItems(inventory) : inventory; if (location) data = data.filter((item) => item.location === location); return NextResponse.json(data); }
