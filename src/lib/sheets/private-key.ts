import { createPrivateKey, type KeyObject } from "node:crypto";
import { readEnv } from "@/lib/env";
import { PRIVATE_KEY_FORMAT_HEADLINE } from "@/lib/sheets/present-error";

export const SHEET_ENV_EMAIL = "GOOGLE_SERVICE_ACCOUNT_EMAIL";
export const SHEET_ENV_KEY = "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY";
export const SHEET_ENV_JSON = "GOOGLE_SERVICE_ACCOUNT_JSON";

function redactSecrets(detail: string): string {
  return detail
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, "[private key]")
    .replace(/[A-Za-z0-9+/=]{80,}/g, "[redacted]");
}

export class PrivateKeyFormatError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(PRIVATE_KEY_FORMAT_HEADLINE);
    this.name = "PrivateKeyFormatError";
    this.detail = redactSecrets(detail);
  }
}

export type ServiceAccountMaterial = {
  email: string;
  privateKey: string;
  source: "json" | "pem";
};

export type SheetsAccountHealth = {
  jsonSet: boolean;
  emailSet: boolean;
  privateKeySet: boolean;
  keyReadable: boolean;
  source: "json" | "pem" | "none";
  /** OpenSSL or parse cause. No key material. */
  formatDetail: string | null;
  summary: string;
};

type ParsedAccount = {
  email: string;
  privateKey: string;
};

function stripOnePair(value: string): string {
  const current = value.trim();
  if (current.length < 2) return current;
  const start = current[0];
  const end = current[current.length - 1];
  if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
    return current.slice(1, -1).trim();
  }
  return current;
}

function stripWrappingQuotes(value: string): string {
  let current = value.trim().replace(/^\uFEFF/, "");
  for (let i = 0; i < 3; i++) {
    const next = stripOnePair(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function unescapeNewlines(value: string): string {
  let current = value;
  for (let i = 0; i < 5; i++) {
    if (!current.includes("\\n") && !current.includes("\\r")) break;
    current = current.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  }
  return current.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseJsonLayers(value: string): unknown {
  let current: unknown = value.trim().replace(/^\uFEFF/, "");
  for (let i = 0; i < 3; i++) {
    if (typeof current !== "string") return current;
    const text = current.trim();
    if (!text) return null;
    try {
      current = JSON.parse(text);
      continue;
    } catch {
      const stripped = stripOnePair(text);
      if (stripped === text) return null;
      current = stripped;
    }
  }
  return current;
}

function parsedAccount(value: unknown): ParsedAccount | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const email = typeof record.client_email === "string" ? record.client_email.trim() : "";
  const privateKey = typeof record.private_key === "string" ? record.private_key : "";
  if (!email && !privateKey) return null;
  return { email, privateKey };
}

function parseServiceAccountJson(raw: string): ParsedAccount | null {
  return parsedAccount(parseJsonLayers(raw));
}

function rebuildPem(value: string): string | null {
  const begin = /-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----/.exec(value);
  const end = /-----END (RSA PRIVATE KEY|PRIVATE KEY)-----/.exec(value);
  if (!begin || !end || begin.index == null || end.index == null) return null;
  if (end.index < begin.index) return null;
  if (begin[1] !== end[1]) return null;
  const body = value.slice(begin.index + begin[0].length, end.index).replace(/[^A-Za-z0-9+/=]/g, "");
  if (body.length < 64) return null;
  const lines = body.match(/.{1,64}/g);
  if (!lines) return null;
  return `-----BEGIN ${begin[1]}-----\n${lines.join("\n")}\n-----END ${begin[1]}-----\n`;
}

/**
 * Turn a Vercel env value into a PEM block.
 * Accepts a real PEM, a one-line PEM with literal `\n`, a quoted PEM,
 * PKCS#8 (`BEGIN PRIVATE KEY`), PKCS#1 (`BEGIN RSA PRIVATE KEY`),
 * or a service-account JSON object (uses `private_key`).
 */
export function normalizePrivateKeyPem(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  if (!trimmed) return null;
  const parsed = parseJsonLayers(trimmed);
  let material = trimmed;
  if (typeof parsed === "string") {
    material = parsed;
  } else if (parsed && typeof parsed === "object") {
    const key = (parsed as Record<string, unknown>).private_key;
    if (typeof key === "string" && key.trim()) material = key;
  }
  material = unescapeNewlines(stripWrappingQuotes(material));
  return rebuildPem(material);
}

function assertReadableKey(pem: string): KeyObject {
  try {
    return createPrivateKey({ key: pem, format: "pem" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "OpenSSL could not read the private key.";
    throw new PrivateKeyFormatError(detail);
  }
}

function accountFromJson(raw: string): ServiceAccountMaterial {
  const parsed = parseServiceAccountJson(raw);
  if (!parsed) {
    throw new PrivateKeyFormatError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is set but it is not service account JSON.",
    );
  }
  if (!parsed.email || !parsed.privateKey) {
    throw new PrivateKeyFormatError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is set but client_email or private_key is missing.",
    );
  }
  const pem = normalizePrivateKeyPem(parsed.privateKey);
  if (!pem) {
    throw new PrivateKeyFormatError(
      "private_key in GOOGLE_SERVICE_ACCOUNT_JSON is not a PEM private key.",
    );
  }
  assertReadableKey(pem);
  return { email: parsed.email, privateKey: pem, source: "json" };
}

function accountFromPem(email: string, keyRaw: string): ServiceAccountMaterial {
  const embedded = parseServiceAccountJson(keyRaw);
  const pemSource = embedded?.privateKey || keyRaw;
  const pem = normalizePrivateKeyPem(pemSource);
  if (!pem) {
    throw new PrivateKeyFormatError(
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is set but it is not a PEM private key.",
    );
  }
  assertReadableKey(pem);
  const resolvedEmail = email || embedded?.email || "";
  if (!resolvedEmail) {
    throw new PrivateKeyFormatError("GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.");
  }
  return { email: resolvedEmail, privateKey: pem, source: "pem" };
}

/**
 * Prefer `GOOGLE_SERVICE_ACCOUNT_JSON` when it is set.
 * Otherwise use the email and private key pair.
 * Returns null when no account env is set.
 */
export function resolveServiceAccount(
  env: Record<string, string | undefined> = process.env,
): ServiceAccountMaterial | null {
  const jsonRaw = readEnv(SHEET_ENV_JSON, env);
  if (jsonRaw) return accountFromJson(jsonRaw);
  const email = readEnv(SHEET_ENV_EMAIL, env);
  const keyRaw = readEnv(SHEET_ENV_KEY, env);
  if (!email && !keyRaw) return null;
  if (!email || !keyRaw) return null;
  return accountFromPem(email, keyRaw);
}

export function serviceAccountSigningKey(pem: string): KeyObject {
  return assertReadableKey(pem);
}

export function missingGoogleServiceAccountEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  if (readEnv(SHEET_ENV_JSON, env)) return [];
  const missing: string[] = [];
  if (!readEnv(SHEET_ENV_EMAIL, env)) missing.push(SHEET_ENV_EMAIL);
  if (!readEnv(SHEET_ENV_KEY, env)) missing.push(SHEET_ENV_KEY);
  return missing;
}

export function authFailureFromError(err: unknown): { note: string; noteDetail: string } {
  if (err instanceof PrivateKeyFormatError) {
    return { note: err.message, noteDetail: err.detail };
  }
  const detail = err instanceof Error ? err.message : "Google service account sign-in failed.";
  if (DECODER_IN.test(detail)) {
    return { note: PRIVATE_KEY_FORMAT_HEADLINE, noteDetail: detail };
  }
  return { note: detail, noteDetail: detail };
}

const DECODER_IN = /DECODER routines|1E08010C|routines::unsupported/i;

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function healthSummary(input: {
  jsonSet: boolean;
  emailSet: boolean;
  privateKeySet: boolean;
  keyReadable: boolean;
  hasMaterial: boolean;
}): string {
  if (!input.hasMaterial) {
    return "Sheet account: JSON no, email no, private key no. Set GOOGLE_SERVICE_ACCOUNT_JSON, or the email and private key, then share each sheet.";
  }
  const format = input.keyReadable ? "key format ok" : "key format wrong";
  return `Sheet account: JSON ${yesNo(input.jsonSet)}, email ${yesNo(input.emailSet)}, private key ${yesNo(input.privateKeySet)}, ${format}.`;
}

/** Non-secret check. Does not return the email address or the key. */
export function sheetsAccountHealth(
  env: Record<string, string | undefined> = process.env,
): SheetsAccountHealth {
  const jsonRaw = readEnv(SHEET_ENV_JSON, env);
  const emailRaw = readEnv(SHEET_ENV_EMAIL, env);
  const keyRaw = readEnv(SHEET_ENV_KEY, env);
  const jsonSet = jsonRaw !== "";
  const jsonParsed = jsonRaw ? parseServiceAccountJson(jsonRaw) : null;
  const keyParsed = !jsonRaw && keyRaw ? parseServiceAccountJson(keyRaw) : null;
  const emailSet = emailRaw !== "" || Boolean(jsonParsed?.email || keyParsed?.email);
  const privateKeySet = keyRaw !== "" || Boolean(jsonParsed?.privateKey || keyParsed?.privateKey);
  const hasMaterial = jsonSet || emailRaw !== "" || keyRaw !== "";
  try {
    const account = resolveServiceAccount(env);
    if (!account) {
      return {
        jsonSet,
        emailSet,
        privateKeySet,
        keyReadable: false,
        source: "none",
        formatDetail: null,
        summary: healthSummary({ jsonSet, emailSet, privateKeySet, keyReadable: false, hasMaterial }),
      };
    }
    return {
      jsonSet,
      emailSet: true,
      privateKeySet: true,
      keyReadable: true,
      source: account.source,
      formatDetail: null,
      summary: healthSummary({
        jsonSet,
        emailSet: true,
        privateKeySet: true,
        keyReadable: true,
        hasMaterial: true,
      }),
    };
  } catch (err) {
    const formatDetail =
      err instanceof PrivateKeyFormatError
        ? err.detail
        : err instanceof Error
          ? err.message
          : "The private key could not be read.";
    return {
      jsonSet,
      emailSet,
      privateKeySet,
      keyReadable: false,
      source: jsonSet ? "json" : "pem",
      formatDetail,
      summary: healthSummary({
        jsonSet,
        emailSet,
        privateKeySet,
        keyReadable: false,
        hasMaterial: true,
      }),
    };
  }
}
