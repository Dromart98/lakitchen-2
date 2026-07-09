import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const allCookies: Array<{ name: string }> = cookieStore.getAll();
  const supabaseCookieNames = allCookies
    .map((cookie) => cookie.name)
    .filter((name) => name.toLowerCase().includes("supabase") || name.startsWith("sb-"));

  const supabase = await createClient();
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
    requestHost: request.headers.get("host"),
    requestUrl: request.url,
    pathname: "/auth/debug",
  });
}
