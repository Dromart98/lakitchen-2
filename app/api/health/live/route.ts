import { NextResponse } from "next/server";

const headers = { "Cache-Control": "no-store" };

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200, headers });
}
