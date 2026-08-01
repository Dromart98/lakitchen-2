import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./env";

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing server-only Supabase administration configuration.");
  }

  const { supabaseUrl } = getSupabaseConfig();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
