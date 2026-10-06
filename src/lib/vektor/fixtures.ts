import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { VektorManifest } from "./types";

export function loadFixtureManifest(filename: string): VektorManifest {
  const path = resolve(process.cwd(), "fixtures", "vektor", filename);
  const raw = JSON.parse(readFileSync(path, "utf8")) as VektorManifest & {
    _lookups?: unknown;
    _comment?: string;
  };
  // Strip test-only keys
  const { _lookups: _l, _comment: _c, ...manifest } = raw as VektorManifest & {
    _lookups?: unknown;
    _comment?: string;
  };
  return manifest as VektorManifest;
}

export function loadFixtureLookups(filename: string): {
  drivers: Record<string, string>;
  brokers: Record<string, string>;
} {
  const path = resolve(process.cwd(), "fixtures", "vektor", filename);
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    _lookups?: {
      drivers?: Record<string, string>;
      brokers?: Record<string, string>;
    };
  };
  return {
    drivers: raw._lookups?.drivers ?? {},
    brokers: raw._lookups?.brokers ?? {},
  };
}
