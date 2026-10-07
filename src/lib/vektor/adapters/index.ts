import { ApiAdapter } from "./api-adapter";
import { CsvExportAdapter } from "./csv-adapter";
import { McpAdapter } from "./mcp-adapter";
import type { ImportSourceAdapter, ImportSourceId } from "./types";

export type AdapterRegistryOptions = {
  mcpVerified: boolean;
  mcpHasTokens: boolean;
  csvColumnMapping: Record<string, string> | null;
  apiBaseUrl: string;
  apiToken: string;
};

export function createAdapters(
  opts: AdapterRegistryOptions,
): ImportSourceAdapter[] {
  return [
    new McpAdapter({
      verified: opts.mcpVerified,
      hasTokens: opts.mcpHasTokens,
    }),
    new CsvExportAdapter({ columnMapping: opts.csvColumnMapping }),
    new ApiAdapter({ baseUrl: opts.apiBaseUrl, token: opts.apiToken }),
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
