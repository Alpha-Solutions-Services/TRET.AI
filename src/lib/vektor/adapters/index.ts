import { ApiAdapter } from "./api-adapter";
import { CsvExportAdapter } from "./csv-adapter";
import { McpAdapter } from "./mcp-adapter";
import { SheetLedgerAdapter, type SheetLedgerSource } from "./sheet-adapter";
import type { ImportSourceAdapter, ImportSourceId } from "./types";

export type AdapterRegistryOptions = {
  mcpVerified: boolean;
  mcpHasTokens: boolean;
  mcpNeedsSignIn?: boolean;
  mcpFetchManifests?: ImportSourceAdapter["fetchManifests"];
  csvColumnMapping: Record<string, string> | null;
  apiBaseUrl: string;
  apiToken: string;
  apiPathTemplate?: string;
  apiFetchImpl?: typeof fetch;
  sheetLoadLedgers?: () => Promise<SheetLedgerSource[]>;
};

export function createAdapters(
  opts: AdapterRegistryOptions,
): ImportSourceAdapter[] {
  return [
    new CsvExportAdapter({ columnMapping: opts.csvColumnMapping }),
    new SheetLedgerAdapter({ loadLedgers: opts.sheetLoadLedgers }),
    new ApiAdapter({
      baseUrl: opts.apiBaseUrl,
      token: opts.apiToken,
      pathTemplate: opts.apiPathTemplate,
      fetchImpl: opts.apiFetchImpl,
    }),
    new McpAdapter({
      verified: opts.mcpVerified,
      hasTokens: opts.mcpHasTokens,
      needsSignIn: opts.mcpNeedsSignIn,
      fetchManifests: opts.mcpFetchManifests,
    }),
  ];
}

export function getSelectableAdapter(
  adapters: ImportSourceAdapter[],
  selected: ImportSourceId | null,
): ImportSourceAdapter | null {
  if (!selected) return null;
  const adapter = adapters.find((a) => a.id === selected);
  if (!adapter) return null;
  if (!adapter.status().selectable) return null;
  return adapter;
}

export type { ImportSourceId, ImportSourceAdapter, AdapterStatus } from "./types";
export { resolveCrossSourceConflict, naturalKey } from "./cross-source";
export type { ExistingLoadSnapshot } from "./cross-source";
