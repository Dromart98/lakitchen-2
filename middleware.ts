import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSupabaseConfig } from "./lib/supabase/env";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  let applySupabaseCookies = () => {};
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        applySupabaseCookies = () => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        };
      },
    },
  });

  const { error } = await supabase.auth.getUser();

  if (error) {
    console.warn("Supabase middleware could not refresh the auth user:", error.message);
    return response;
  }

  applySupabaseCookies();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
