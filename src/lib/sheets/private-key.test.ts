import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { copyableErrorText, presentCopyableError } from "@/lib/sheets/present-error";
import {
  normalizePrivateKeyPem,
  resolveServiceAccount,
  sheetsAccountHealth,
} from "@/lib/sheets/private-key";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pkcs1 = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

function expectReadable(pem: string | null): void {
  expect(pem).toBeTruthy();
  expect(() => createPrivateKey({ key: pem ?? "", format: "pem" })).not.toThrow();
}

describe("service account private key", () => {
  it("reads a literal newline PEM, a quoted PEM, and JSON private_key", () => {
    const literal = pkcs8.replace(/\n/g, "\\n");
    const quoted = `"${literal}"`;
    const json = JSON.stringify({
      client_email: "sheets@example.iam.gserviceaccount.com",
      private_key: pkcs8,
    });
    const jsonLiteralKey = JSON.stringify({
      client_email: "sheets@example.iam.gserviceaccount.com",
      private_key: literal,
    });

    expectReadable(normalizePrivateKeyPem(literal));
    expectReadable(normalizePrivateKeyPem(quoted));
    expectReadable(normalizePrivateKeyPem(json));
    expectReadable(normalizePrivateKeyPem(jsonLiteralKey));
    expect(normalizePrivateKeyPem(pkcs8)).toMatch(/BEGIN PRIVATE KEY/);
  });

  it("reads a PKCS1 PEM after newline normalization", () => {
    const normalized = normalizePrivateKeyPem(pkcs1.replace(/\n/g, "\\n"));
    expect(normalized).toMatch(/BEGIN RSA PRIVATE KEY/);
    expectReadable(normalized);
  });

  it("prefers GOOGLE_SERVICE_ACCOUNT_JSON over the email and key pair", () => {
    const account = resolveServiceAccount({
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "json@example.iam.gserviceaccount.com",
        private_key: pkcs8.replace(/\n/g, "\\n"),
      }),
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "pem@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pkcs1,
    });
    expect(account).toMatchObject({
      email: "json@example.iam.gserviceaccount.com",
      source: "json",
    });
    expectReadable(account?.privateKey ?? null);
  });

  it("keeps the email and private key path when JSON is absent", () => {
    const account = resolveServiceAccount({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "pem@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: `"${pkcs8.replace(/\n/g, "\\n")}"`,
    });
    expect(account).toMatchObject({
      email: "pem@example.iam.gserviceaccount.com",
      source: "pem",
    });
    expectReadable(account?.privateKey ?? null);
  });

  it("reports a wrong key format without including the key", () => {
    const bad = `-----BEGIN PRIVATE KEY-----\\n${"A".repeat(200)}\\n-----END PRIVATE KEY-----`;
    const health = sheetsAccountHealth({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "sheets@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: bad,
    });
    expect(health.keyReadable).toBe(false);
    expect(health.summary).toMatch(/key format wrong/);
    expect(health.formatDetail).toBeTruthy();
    expect(health.formatDetail).not.toContain("A".repeat(40));
    expect(health.summary).not.toContain(bad);
  });
});

describe("copyable error", () => {
  it("keeps the OpenSSL cause for the clipboard and a plain headline", () => {
    const detail = "error:1E08010C:DECODER routines::unsupported";
    expect(presentCopyableError(detail)).toEqual({
      headline: "Google private key on the server is the wrong format",
      detail,
    });
    expect(copyableErrorText("Google private key on the server is the wrong format", detail)).toBe(detail);
  });
});
