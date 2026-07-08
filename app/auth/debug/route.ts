import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  return NextResponse.json({
    authenticated: Boolean(user),
    userIdPresent: Boolean(user?.id),
    userEmailPresent: Boolean(user?.email),
    getUserErrorMessage: error?.message ?? null,
    cookiesCount: cookieStore.getAll().length,
    pathname: "/auth/debug",
  });
}
