import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

// Node-only module. Keep all imports under server/: no NEXT_PUBLIC_ privileged configuration.
import "node:crypto";

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: authOptions });
}

/** Never authenticate on the admin singleton: signing in changes the client's authorization. */
export function createSupabaseAuthClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: authOptions });
}
