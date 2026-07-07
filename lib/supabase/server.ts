import { cookies } from "next/headers";

import { getSupabaseConfig } from "./env";

async function loadSupabaseSsr() {
  const importModule = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("@supabase/ssr")>;

  return importModule("@supabase/ssr");
}

export async function createClient() {
  const cookieStore = await cookies();
  const { createServerClient } = await loadSupabaseSsr();
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies directly. Middleware or Server Actions
          // can refresh and persist sessions when auth is introduced.
        }
      },
    },
  });
}
