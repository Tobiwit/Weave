import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The optional cloud layer.
 *
 * Weave is local-first and stays fully usable with none of this configured:
 * every call site treats a missing client as "no account, carry on". Accounts
 * add sync and Spotify import; they never gate the app behind a login.
 *
 * The client library is imported lazily so an install that never signs in
 * never pays for the bundle.
 */

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseUrl(): string | undefined {
  const value = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return value && value.trim() ? value.trim() : undefined;
}

function getAnonKey(): string | undefined {
  const value = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return value && value.trim() ? value.trim() : undefined;
}

/** True when the build has cloud credentials. Safe to call anywhere. */
export function isCloudConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getAnonKey());
}

export async function getCloudClient(): Promise<SupabaseClient | null> {
  if (!isCloudConfigured()) return null;

  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(getSupabaseUrl()!, getAnonKey()!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // The magic link lands back on the app URL with tokens in the hash.
          detectSessionInUrl: true,
        },
      });
    })().catch(() => {
      clientPromise = null;
      return null;
    });
  }

  return clientPromise;
}
