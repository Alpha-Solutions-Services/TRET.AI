import { mapFuelRecord, mapTollRecord, recordsFromPayload } from "@/lib/fuel-tolls/map";
import type { FuelDraft, TollDraft } from "@/lib/fuel-tolls/types";
import {
  MCP_FUEL_AGGREGATE_TOOL,
  MCP_FUEL_LIST_TOOL,
  MCP_TOLLS_LIST_TOOL,
  MCP_TOLLS_STATS_TOOL,
  assertMcpToolAllowed,
} from "./allowlist";
import { VEKTOR_LIST_PER_PAGE, buildTransactionDateArgs, buildTrucksGetByIdsArgs } from "./args";
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
  const seenPages = new Set<string>();
  const seenTokens = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const payload = await callAllowlisted(
      callTool,
      tool,
      buildTransactionDateArgs({ from, to, page }),
    );
    const batch = recordsFromPayload(payload, arrayKeys);
    const fingerprint = JSON.stringify(batch);
    if (batch.length === 0 || seenPages.has(fingerprint)) break;
    seenPages.add(fingerprint);
    rows.push(...batch);
    const next = nextPageToken(payload);
    if (batch.length < VEKTOR_LIST_PER_PAGE && (!next || seenTokens.has(next))) break;
    if (next) seenTokens.add(next);
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
  const notes: string[] = [];
  let names: string[] | null = null;
  if (opts.listToolNames) {
    names = await opts.listToolNames();
    for (const required of [MCP_FUEL_LIST_TOOL, MCP_TOLLS_LIST_TOOL]) {
      if (!names.includes(required)) {
        notes.push(`Vektor did not list ${required}. That source was skipped.`);
      }
    }
  }
  const has = (tool: string) => !names || names.includes(tool);

  const fuelRaw = has(MCP_FUEL_LIST_TOOL)
    ? await listPages(opts.callTool, MCP_FUEL_LIST_TOOL, opts.from, opts.to, [
    "transactions",
    "fuel_transactions",
    "items",
    "data",
    "results",
  ])
    : [];
  const tollRaw = has(MCP_TOLLS_LIST_TOOL)
    ? await listPages(opts.callTool, MCP_TOLLS_LIST_TOOL, opts.from, opts.to, [
    "tolls",
    "transactions",
    "items",
    "data",
    "results",
  ])
    : [];

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
  const canTrucks = !names || names.includes("fleet_Trucks_GetByIDs");
  if (!canTrucks && ids.length > 0) {
    notes.push("Vektor did not list fleet_Trucks_GetByIDs. That source was skipped.");
  }
  for (let i = 0; canTrucks && i < ids.length; i += 100) {
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
      notes: [...notes, aggregate.note, stats.note].filter((note): note is string => Boolean(note)),
    },
  };
}
