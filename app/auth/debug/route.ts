import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  const supabaseCookieNames = cookieStore
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith("sb-"));

  return NextResponse.json({
    authenticated: Boolean(user),
    userIdPresent: Boolean(user?.id),
    userEmailPresent: Boolean(user?.email),
    getUserErrorMessage: error?.message ?? null,
    cookiesCount: cookieStore.getAll().length,
    hasSupabaseCookie: supabaseCookieNames.length > 0,
    supabaseCookieNames,
    requestHost: headerStore.get("host"),
    requestUrl: request.url,
    pathname: "/auth/debug",
  });
}
