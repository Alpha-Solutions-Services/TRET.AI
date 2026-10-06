import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabasePublicConfig } from "@/lib/env";

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("CONFIG_MISSING");
  }

  return createBrowserClient<Database>(config.url, config.anonKey, {
    cookieEncoding: "base64url",
  });
}
