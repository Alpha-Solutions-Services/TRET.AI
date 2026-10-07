import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "tret-ai-vektor-oauth-v1";

/** Server env name only. Never log the value. */
export const TOKEN_ENCRYPTION_ENV = "VEKTOR_TOKEN_ENCRYPTION_KEY";

export function readTokenEncryptionKey(
  env: Record<string, string | undefined> = process.env,
): string {
  const key = (env[TOKEN_ENCRYPTION_ENV] ?? "").trim();
  if (!key) {
    throw new Error(`${TOKEN_ENCRYPTION_ENV} is not set`);
  }
  return key;
}

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, 32);
}

/** AES-256-GCM. Output is base64 and must not be logged next to plaintext. */
export function encryptString(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64");
}

export function decryptString(payload: string, secret: string, label = "Vektor"): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 12 + 16 + 1) {
    throw new Error(`Stored ${label} secret could not be read`);
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
