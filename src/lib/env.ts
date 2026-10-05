/**
 * Env vars required for the web app to run (Vercel + local).
 * Local-only script vars (SUPABASE_SERVICE_ROLE_KEY, ADMIN_*) are not listed here.
 */
export const REQUIRED_APP_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type RequiredAppEnvName = (typeof REQUIRED_APP_ENV_NAMES)[number];

export function getMissingRequiredEnvNames(
  env: Record<string, string | undefined> = process.env,
): RequiredAppEnvName[] {
  return REQUIRED_APP_ENV_NAMES.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

export function isAppConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getMissingRequiredEnvNames(env).length === 0;
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
