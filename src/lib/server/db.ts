import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase holds only the sponsor service's rate-limit counters (FR-3.4).
// Server-only: the service-role key never reaches the browser.

let client: SupabaseClient | null | undefined;

/**
 * The Vercel Supabase integration may prefix its variables (STORAGE_,
 * a custom prefix, NEXT_PUBLIC_ for the URL). Prefer the plain name, else
 * any variable ending in the expected suffix.
 */
function env(suffix: string): string | undefined {
  if (process.env[suffix]) return process.env[suffix];
  const key = Object.keys(process.env).find((k) => k.endsWith(`_${suffix}`) && process.env[k]);
  return key ? process.env[key] : undefined;
}

export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
