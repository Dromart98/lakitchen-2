import { getSupabaseConfig } from "./env";

export const SUPABASE_READINESS_TIMEOUT_MS = 2_000;

export async function checkSupabaseReadiness(
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = SUPABASE_READINESS_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();
    const timeoutResult = new Promise<Response>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Readiness check timed out."));
      }, timeoutMs);
    });
    const response = await Promise.race([
      fetchImplementation(`${supabaseUrl}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: supabasePublishableKey,
        },
        cache: "no-store",
        signal: controller.signal,
      }),
      timeoutResult,
    ]);

    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
