/**
 * Client-safe app version. No node:fs and no node:path.
 * Keep this string equal to the VERSION file.
 * package.json stays 0.0.0 because npm cannot store a 4-part version.
 */
export const APP_VERSION = "0.0.0.24";

export function formatFooterLabel(version: string = APP_VERSION): string {
  return `TRET.AI v${version}`;
}
