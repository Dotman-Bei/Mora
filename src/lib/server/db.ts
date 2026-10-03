import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The index (PRD §10.1). Server-only: the service-role key never reaches the
// browser. Functions are stateless; this client holds no data (PRD §10.3).

let client: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

export class IndexUnavailableError extends Error {
  constructor() {
    super("The index isn't configured. Claim links still work: they read the contract directly.");
  }
}

export function requireDb(): SupabaseClient {
  const c = db();
  if (!c) throw new IndexUnavailableError();
  return c;
}
