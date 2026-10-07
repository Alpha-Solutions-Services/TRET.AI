import type { LookupMaps } from "../map";
import type { ImportWindowReport } from "../mcp/window";
import type { VektorManifest } from "../types";

export type ImportSourceId = "mcp" | "csv" | "api";

export type AdapterStatus = {
  id: ImportSourceId;
  label: string;
  /** Can this source be selected in Settings? */
  selectable: boolean;
  /** Plain-language why not, or readiness note */
  message: string;
  configured: boolean;
};

export type FetchManifestsInput = {
  from: string;
  to: string;
};

export type FetchManifestsResult = {
  manifests: VektorManifest[];
  lookups: LookupMaps;
  report?: ImportWindowReport;
};

/**
 * Each adapter only produces the normalized VektorManifest model (+ lookups).
 * Pure map/validate/promote stays shared.
 */
export interface ImportSourceAdapter {
  readonly id: ImportSourceId;
  status(): AdapterStatus;
  fetchManifests(input: FetchManifestsInput): Promise<FetchManifestsResult>;
}
