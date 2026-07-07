import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./env";

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
