import { redirect } from "next/navigation";

import type { createClient } from "./server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AuthUser = NonNullable<Awaited<ReturnType<SupabaseServerClient["auth"]["getUser"]>>["data"]["user"]>;

export async function getAuthenticatedUser(supabase: SupabaseServerClient, context: string): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.warn(`Supabase could not read the ${context} auth user:`, error.message);
  }

  return data.user ?? null;
}

export async function requireAuthenticatedUser(supabase: SupabaseServerClient, context: string): Promise<AuthUser> {
  const user = await getAuthenticatedUser(supabase, context);

  if (user) {
    return user;
  }

  redirect("/login");
  throw new Error("Authenticated route redirect did not complete.");
}
