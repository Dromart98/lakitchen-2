// Temporary fallback for the Codex environment only.
//
// The real project dependency is @supabase/ssr, declared in package.json.
// Remove this file after `npm install` can download @supabase/ssr normally
// in the working environment so TypeScript uses the package's real types.

type SupabaseAuthError = { message: string };
type SupabaseUser = { id: string; email?: string };
type SupabaseSession = { access_token: string };
type SupabaseCredentials = { email: string; password: string };
type SupabaseAuthResult<TData> = Promise<{ data: TData; error: SupabaseAuthError | null }>;
type SupabaseClientLike = {
  auth: {
    getUser(): SupabaseAuthResult<{ user: SupabaseUser | null }>;
    signInWithPassword(credentials: SupabaseCredentials): SupabaseAuthResult<{ user: SupabaseUser | null; session: SupabaseSession | null }>;
    signUp(credentials: SupabaseCredentials): SupabaseAuthResult<{ user: SupabaseUser | null; session: SupabaseSession | null }>;
    signOut(): Promise<{ error: SupabaseAuthError | null }>;
  };
};

declare module "@supabase/ssr" {
  export function createBrowserClient(supabaseUrl: string, supabaseKey: string): SupabaseClientLike;

  export function createServerClient(
    supabaseUrl: string,
    supabaseKey: string,
    options: {
      cookies: {
        getAll(): Array<{ name: string; value: string }>;
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ): void;
      };
    },
  ): SupabaseClientLike;
}
