import { NextResponse } from "next/server";

import { checkSupabaseReadiness } from "@/lib/supabase/readiness";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const isReady = await checkSupabaseReadiness();

  return NextResponse.json(
    { status: isReady ? "ready" : "unavailable" },
    { status: isReady ? 200 : 503, headers },
  );
}
