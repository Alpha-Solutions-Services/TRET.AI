import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LookupMaps, TruckLookupRecord } from "./map";
import type { VektorManifest } from "./types";

export function loadFixtureManifest(filename: string): VektorManifest {
  const path = resolve(process.cwd(), "fixtures", "vektor", filename);
  const raw = JSON.parse(readFileSync(path, "utf8")) as VektorManifest & {
    _lookups?: unknown;
    _comment?: string;
  };
  const { _lookups: _l, _comment: _c, ...manifest } = raw as VektorManifest & {
    _lookups?: unknown;
    _comment?: string;
  };
  return manifest as VektorManifest;
}

export function loadFixtureLookups(filename: string): LookupMaps {
  const path = resolve(process.cwd(), "fixtures", "vektor", filename);
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    _lookups?: {
      drivers?: Record<string, string>;
      brokers?: Record<string, string>;
      trucks?: Record<string, TruckLookupRecord>;
    };
  };
  return {
    drivers: raw._lookups?.drivers ?? {},
    brokers: raw._lookups?.brokers ?? {},
    trucks: raw._lookups?.trucks ?? {},
  };
}
