import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import type { createClient } from "./server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getAuthenticatedUser(supabase: SupabaseServerClient, context: string): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.warn(`Supabase could not read the ${context} auth user:`, error.message);
  }

  return data.user ?? null;
}

export async function requireAuthenticatedUser(supabase: SupabaseServerClient, context: string): Promise<User> {
  const user = await getAuthenticatedUser(supabase, context);

  if (!user) {
    redirect("/login");
  }

  return user;
}
