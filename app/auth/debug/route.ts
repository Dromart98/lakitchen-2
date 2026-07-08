import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const supabase = await createClient();

  const allCookies = cookieStore.getAll();
  const supabaseCookieNames = allCookies
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith("sb-"));

  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  return NextResponse.json({
    authenticated: Boolean(user),
    userIdPresent: Boolean(user?.id),
    userEmailPresent: Boolean(user?.email),
    getUserErrorMessage: error?.message ?? null,
    cookiesCount: allCookies.length,
    hasSupabaseCookie: supabaseCookieNames.length > 0,
    supabaseCookieNames,
    requestHost: headerStore.get("host"),
    requestUrl: headerStore.get("x-url") ?? null,
    pathname: "/auth/debug",
  });
}
