/**
 * Env vars required for the web app to run (Vercel + local).
 * Local-only script vars (SUPABASE_SERVICE_ROLE_KEY, ADMIN_*) are not listed here.
 */
export const REQUIRED_APP_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type RequiredAppEnvName = (typeof REQUIRED_APP_ENV_NAMES)[number];

/**
 * Read via bracket access so Next.js does not bake an empty string into the
 * server bundle when the var was missing at an earlier build.
 */
export function readEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  return (env[name] ?? "").trim();
}

export function getMissingRequiredEnvNames(
  env: Record<string, string | undefined> = process.env,
): RequiredAppEnvName[] {
  return REQUIRED_APP_ENV_NAMES.filter((name) => readEnv(name, env) === "");
}

export function isAppConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getMissingRequiredEnvNames(env).length === 0;
}

export function getSupabasePublicConfig(
  env: Record<string, string | undefined> = process.env,
): { url: string; anonKey: string } | null {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL", env);
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", env);
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Logs missing variable NAMES only — never values.
 */
export function logMissingRequiredEnvNames(missing: readonly string[]): void {
  if (missing.length === 0) return;
  console.error(
    `TRET.AI setup incomplete. Missing environment variable names: ${missing.join(", ")}`,
  );
}
