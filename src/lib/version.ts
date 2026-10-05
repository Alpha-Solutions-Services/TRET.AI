import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * App version comes only from the VERSION file at the repo root.
 * package.json stays at 0.0.0 because npm cannot store 4-part versions.
 */
export function readAppVersion(cwd: string = process.cwd()): string {
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
