import { readEnv } from "@/lib/env";

export const INTUIT_CLIENT_ID = "INTUIT_CLIENT_ID";
export const INTUIT_CLIENT_SECRET = "INTUIT_CLIENT_SECRET";
export const INTUIT_REDIRECT_URI = "INTUIT_REDIRECT_URI";
export const INTUIT_ENVIRONMENT = "INTUIT_ENVIRONMENT";
export const QUICKBOOKS_TOKEN_ENCRYPTION_KEY = "QUICKBOOKS_TOKEN_ENCRYPTION_KEY";

export const QUICKBOOKS_ENV_NAMES = [
  INTUIT_CLIENT_ID,
  INTUIT_CLIENT_SECRET,
  INTUIT_REDIRECT_URI,
  INTUIT_ENVIRONMENT,
  QUICKBOOKS_TOKEN_ENCRYPTION_KEY,
] as const;

export type QuickbooksEnvironment = "sandbox" | "production";

export type QuickbooksConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QuickbooksEnvironment;
  encryptionKey: string;
};

function redirectUriAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    const host = url.hostname;
    return url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * Null when any required name is missing or INTUIT_ENVIRONMENT is not sandbox or production.
 * Callers show a setup message. This function does not throw.
 */
export function readQuickbooksConfig(
  env: Record<string, string | undefined> = process.env,
): QuickbooksConfig | null {
  const clientId = readEnv(INTUIT_CLIENT_ID, env);
  const clientSecret = readEnv(INTUIT_CLIENT_SECRET, env);
  const redirectUri = readEnv(INTUIT_REDIRECT_URI, env);
  const environmentRaw = readEnv(INTUIT_ENVIRONMENT, env).toLowerCase();
  const encryptionKey = readEnv(QUICKBOOKS_TOKEN_ENCRYPTION_KEY, env);
  const environment =
    environmentRaw === "sandbox" || environmentRaw === "production" ? environmentRaw : null;
  if (!clientId || !clientSecret || !redirectUri || !environment || !encryptionKey) return null;
  if (!redirectUriAllowed(redirectUri)) return null;
  return { clientId, clientSecret, redirectUri, environment, encryptionKey };
}

/** Names that are blank or, for INTUIT_ENVIRONMENT, not sandbox or production. Never values. */
export function missingQuickbooksEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const missing: string[] = [];
  if (!readEnv(INTUIT_CLIENT_ID, env)) missing.push(INTUIT_CLIENT_ID);
  if (!readEnv(INTUIT_CLIENT_SECRET, env)) missing.push(INTUIT_CLIENT_SECRET);
  const redirectUri = readEnv(INTUIT_REDIRECT_URI, env);
  if (!redirectUri || !redirectUriAllowed(redirectUri)) missing.push(INTUIT_REDIRECT_URI);
  const environmentRaw = readEnv(INTUIT_ENVIRONMENT, env).toLowerCase();
  if (environmentRaw !== "sandbox" && environmentRaw !== "production") {
    missing.push(INTUIT_ENVIRONMENT);
  }
  if (!readEnv(QUICKBOOKS_TOKEN_ENCRYPTION_KEY, env)) missing.push(QUICKBOOKS_TOKEN_ENCRYPTION_KEY);
  return missing;
}
