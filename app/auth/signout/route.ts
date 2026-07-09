import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url));
}

export async function POST(request: Request) {
  const supabase = await createClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), 303);
}
