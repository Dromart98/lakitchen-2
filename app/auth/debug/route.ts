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
  const cookieNames = cookieStore.getAll().map((cookie) => cookie.name);
  const supabaseCookieNames = cookieNames.filter((name) => name.startsWith("sb-"));

  return NextResponse.json({
    authenticated: Boolean(user),
    userIdPresent: Boolean(user?.id),
    userEmailPresent: Boolean(user?.email),
    getUserErrorMessage: error?.message ?? null,
    cookiesCount: cookieNames.length,
    hasSupabaseCookie: supabaseCookieNames.length > 0,
    supabaseCookieNames,
    requestHost: headerStore.get("host"),
    requestUrl: request.url,
    pathname: request.nextUrl.pathname,
  });
}
