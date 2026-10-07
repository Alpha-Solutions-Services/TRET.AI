import { mapFuelRecord, mapTollRecord, recordsFromPayload } from "@/lib/fuel-tolls/map";
import type { FuelDraft, TollDraft } from "@/lib/fuel-tolls/types";
import {
  MCP_FUEL_AGGREGATE_TOOL,
  MCP_FUEL_LIST_TOOL,
  MCP_TOLLS_LIST_TOOL,
  MCP_TOLLS_STATS_TOOL,
  assertMcpToolAllowed,
} from "./allowlist";
import { buildTransactionDateArgs, buildTrucksGetByIdsArgs } from "./args";
import { nextPageToken, trucksFromPayload, unwrapToolPayload } from "./parse";
import { withRetry, withTimeout } from "./retry";
import type { ToolCaller } from "./fetch-manifests";

const MAX_PAGES = 40;

export type FuelTollFetchReport = {
  fuelAggregate: unknown | null;
  tollStats: unknown | null;
  notes: string[];
};

async function callAllowlisted(
  callTool: ToolCaller,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  assertMcpToolAllowed(name);
  const result = await withRetry(() => withTimeout(callTool(name, args)));
  return unwrapToolPayload(result);
}

async function listPages(
  callTool: ToolCaller,
  tool: string,
  from: string,
  to: string,
  arrayKeys: string[],
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let pageToken = "";
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = await callAllowlisted(
      callTool,
      tool,
      buildTransactionDateArgs({ from, to, pageToken }),
    );
    rows.push(...recordsFromPayload(payload, arrayKeys));
    const next = nextPageToken(payload) ?? "";
    if (!next || seen.has(next)) break;
    seen.add(next);
    pageToken = next;
  }
  return rows;
}

async function callOptional(
  callTool: ToolCaller,
  listToolNames: (() => Promise<string[]>) | undefined,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ value: unknown | null; note: string | null }> {
  if (listToolNames) {
    const names = await listToolNames();
    if (!names.includes(tool)) {
      return { value: null, note: `${tool} was not in tools/list. Totals use the transaction list.` };
    }
  }
  try {
    return { value: await callAllowlisted(callTool, tool, args), note: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unauthorized|needs sign-in|401/i.test(message)) throw err;
    return {
      value: null,
      note: `${tool} did not return totals. Transaction list is still imported.`,
    };
  }
}

export async function fetchFuelAndTollsFromTools(opts: {
  from: string;
  to: string;
  callTool: ToolCaller;
  listToolNames?: () => Promise<string[]>;
}): Promise<{
  fuel: FuelDraft[];
  tolls: TollDraft[];
  report: FuelTollFetchReport;
}> {
  if (opts.listToolNames) {
    const names = await opts.listToolNames();
    for (const required of [MCP_FUEL_LIST_TOOL, MCP_TOLLS_LIST_TOOL, "fleet_Trucks_GetByIDs"]) {
      if (!names.includes(required)) {
        throw new Error(
          `Vektor did not expose required read tool ${required}. On the consent screen, enable read tools and try again.`,
        );
      }
    }
  }

  const fuelRaw = await listPages(opts.callTool, MCP_FUEL_LIST_TOOL, opts.from, opts.to, [
    "transactions",
    "fuel_transactions",
    "items",
    "data",
    "results",
  ]);
  const tollRaw = await listPages(opts.callTool, MCP_TOLLS_LIST_TOOL, opts.from, opts.to, [
    "tolls",
    "transactions",
    "items",
    "data",
    "results",
  ]);

  const truckIds = new Set<string>();
  for (const row of tollRaw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = record.truckId ?? record.truck_id;
    if (typeof id === "string" && id) truckIds.add(id);
    const truck = record.truck;
    if (truck && typeof truck === "object") {
      const nested = truck as Record<string, unknown>;
      const nestedId = nested.truckId ?? nested.truck_id ?? nested.id;
      if (typeof nestedId === "string" && nestedId) truckIds.add(nestedId);
    }
  }

  const lookup = new Map<string, string>();
  const ids = [...truckIds];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const payload = await callAllowlisted(
      opts.callTool,
      "fleet_Trucks_GetByIDs",
      buildTrucksGetByIdsArgs(chunk),
    );
    for (const truck of trucksFromPayload(payload)) {
      lookup.set(truck.truckId, truck.referenceId);
    }
  }

  const aggregate = await callOptional(
    opts.callTool,
    opts.listToolNames,
    MCP_FUEL_AGGREGATE_TOOL,
    buildTransactionDateArgs({ from: opts.from, to: opts.to }),
  );
  const stats = await callOptional(
    opts.callTool,
    opts.listToolNames,
    MCP_TOLLS_STATS_TOOL,
    buildTransactionDateArgs({ from: opts.from, to: opts.to }),
  );

  return {
    fuel: fuelRaw.map((row) => mapFuelRecord(row)),
    tolls: tollRaw.map((row) => mapTollRecord(row, lookup)),
    report: {
      fuelAggregate: aggregate.value,
      tollStats: stats.value,
      notes: [aggregate.note, stats.note].filter((note): note is string => Boolean(note)),
    },
  };
}
