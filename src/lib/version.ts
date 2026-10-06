import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * App version comes from the VERSION file at the repo root (baked into
 * TRET_AI_VERSION at build time for Vercel serverless).
 * package.json stays at 0.0.0 because npm cannot store 4-part versions.
 */
export function readAppVersion(cwd: string = process.cwd()): string {
  const fromBuild = process.env.TRET_AI_VERSION?.trim();
  if (fromBuild) {
    return fromBuild;
  }

  const raw = readFileSync(join(cwd, "VERSION"), "utf8");
  const version = raw.trim();
  if (!version) {
    throw new Error("VERSION file is empty");
  }
  return version;
}

export function formatFooterLabel(version: string): string {
  return `TRET.AI v${version}`;
}
