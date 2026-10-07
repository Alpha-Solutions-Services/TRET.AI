import type { FetchManifestsResult } from "../adapters/types";
import type { VektorManifest } from "../types";
import { assertMcpToolAllowed } from "./allowlist";
import {
  VEKTOR_LIST_PER_PAGE,
  buildManifestListArgs,
  buildOrderDetailsGetArgs,
  buildTrucksGetByIdsArgs,
} from "./args";
import { IdCache } from "./cache";
import { defaultManifestFilters, manifestFilterProbes } from "./filters";
import {
  manifestsFromPayload,
  mcpToolErrorText,
  nextPageToken,
  partyName,
  summarizePayloadShape,
  trucksFromPayload,
  unwrapToolPayload,
} from "./parse";
import { withRetry, withTimeout } from "./retry";
import { expandFirstStopWindow, summarizeManifestWindow } from "./window";

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export type ListedTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

const MAX_PAGES = 40;

async function callAllowlisted(
  callTool: ToolCaller,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  assertMcpToolAllowed(name);
  const result = await withRetry(() => withTimeout(callTool(name, args)));
  return unwrapToolPayload(result);
}

function rememberParties(
  manifest: VektorManifest,
  drivers: IdCache<string>,
  brokers: IdCache<string>,
): void {
  const raw = manifest as VektorManifest & {
    driverName?: string;
    primaryDriverName?: string;
  };
  if (manifest.primaryDriverId) {
    const name = raw.driverName ?? raw.primaryDriverName ?? null;
    if (name) drivers.remember(manifest.primaryDriverId, name);
  }
  for (const order of manifest.orders ?? []) {
    const brokerId = order.brokerId;
    const name = partyName(order as unknown as Record<string, unknown>, [
      "brokerName",
      "broker_name",
      "name",
    ]);
    if (brokerId && name && name !== order.friendlyId) {
      brokers.remember(brokerId, name);
    }
  }
  for (const stop of manifest.stops ?? []) {
    const brokerId = stop.orderBrokerId;
    const name = partyName(stop as unknown as Record<string, unknown>, [
      "brokerName",
      "broker_name",
    ]);
    if (brokerId && name) brokers.remember(brokerId, name);
  }
}

type PageHit = {
  manifests: VektorManifest[];
  payload: unknown;
  errorText: string | null;
};

function redactNote(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 400);
}

async function readManifestPage(
  callTool: ToolCaller,
  filters: unknown,
  page: number,
): Promise<PageHit> {
  assertMcpToolAllowed("core_Manifests_Get");
  const raw = await withRetry(() =>
    withTimeout(
      callTool("core_Manifests_Get", buildManifestListArgs(filters, page)),
    ),
  );
  const errorText = mcpToolErrorText(raw);
  const payload = unwrapToolPayload(raw);
  return {
    manifests: errorText ? [] : manifestsFromPayload(payload),
    payload,
    errorText: errorText ? redactNote(errorText) : null,
  };
}

export async function fetchManifestsFromTools(opts: {
  from: string;
  to: string;
  callTool: ToolCaller;
  listTools?: () => Promise<ListedTool[]>;
}): Promise<FetchManifestsResult> {
  const window = expandFirstStopWindow(opts.from, opts.to);
  const manifests: VektorManifest[] = [];
  const seenIds = new Set<string>();
  const seenTokens = new Set<string>();
  const notes: string[] = [];
  const primary = defaultManifestFilters(window.queryFrom, window.queryTo);
  const triedLabels = [primary.label];
  let chosen = primary;
  let first = await readManifestPage(opts.callTool, primary.filters, 1);
  let sawSuccessfulCall = !first.errorText;
  if (first.errorText) notes.push(first.errorText);

  if (first.manifests.length === 0) {
    let schema: unknown;
    if (opts.listTools) {
      try {
        const tools = await opts.listTools();
        schema = tools.find((tool) => tool.name === "core_Manifests_Get")?.inputSchema;
        if (!schema) {
          notes.push("tools/list did not include an input schema for core_Manifests_Get.");
        }
      } catch (err) {
        notes.push(redactNote(err instanceof Error ? err.message : String(err)));
      }
    }
    for (const probe of manifestFilterProbes({
      queryFrom: window.queryFrom,
      queryTo: window.queryTo,
      schema,
      alreadyTried: primary.filters,
    })) {
      triedLabels.push(probe.label);
      const hit = await readManifestPage(opts.callTool, probe.filters, 1);
      if (hit.errorText) notes.push(`${probe.label}: ${hit.errorText}`);
      else sawSuccessfulCall = true;
      if (hit.manifests.length === 0) continue;
      chosen = probe;
      first = hit;
      notes.push(`Date filter ${primary.label} returned no manifests. Used ${probe.label}.`);
      break;
    }
  }

  if (first.manifests.length === 0 && !sawSuccessfulCall) {
    throw new Error(
      notes.join(" ") || "Vektor did not return a manifest list. The import did not record a successful empty run.",
    );
  }

  const take = (batch: VektorManifest[]): number => {
    let added = 0;
    for (const manifest of batch) {
      if (seenIds.has(manifest.manifestId)) continue;
      seenIds.add(manifest.manifestId);
      manifests.push(manifest);
      added += 1;
    }
    return added;
  };

  const firstAdded = take(first.manifests);
  const firstNext = nextPageToken(first.payload);
  const shortFirst =
    first.manifests.length < VEKTOR_LIST_PER_PAGE && (!firstNext || seenTokens.has(firstNext));
  if (firstNext) seenTokens.add(firstNext);
  if (firstAdded > 0 && !shortFirst) {
    for (let page = 2; page <= MAX_PAGES; page++) {
      const hit = await readManifestPage(opts.callTool, chosen.filters, page);
      if (hit.errorText) {
        notes.push(hit.errorText);
        break;
      }
      const added = take(hit.manifests);
      const next = nextPageToken(hit.payload);
      if (added === 0) break;
      if (hit.manifests.length < VEKTOR_LIST_PER_PAGE && (!next || seenTokens.has(next))) break;
      if (next) seenTokens.add(next);
    }
  }

  for (const manifest of manifests) {
    const needsDetails = (manifest.orders ?? []).length === 0 || (manifest.stops ?? []).length === 0;
    if (!needsDetails) continue;
    const details = await callAllowlisted(
      opts.callTool,
      "core_Manifests_OrderDetailsGet",
      buildOrderDetailsGetArgs(manifest.manifestId),
    );
    const [detailed] = manifestsFromPayload(details);
    if (!detailed) continue;
    if ((manifest.orders ?? []).length === 0 && detailed.orders) {
      manifest.orders = detailed.orders;
    }
    if ((manifest.stops ?? []).length === 0 && detailed.stops) {
      manifest.stops = detailed.stops;
    }
    if (!manifest.grossAmount && detailed.grossAmount) {
      manifest.grossAmount = detailed.grossAmount;
    }
  }

  const drivers = new IdCache<string>();
  const brokers = new IdCache<string>();
  const truckCache = new IdCache<{ truckId: string; referenceId: string }>();
  for (const manifest of manifests) {
    rememberParties(manifest, drivers, brokers);
  }

  const missingTruckIds = [
    ...new Set(
      manifests
        .map((manifest) => manifest.truckId)
        .filter((id): id is string => Boolean(id && !truckCache.has(id))),
    ),
  ];
  for (let i = 0; i < missingTruckIds.length; i += 50) {
    const ids = missingTruckIds.slice(i, i + 50);
    const payload = await callAllowlisted(
      opts.callTool,
      "fleet_Trucks_GetByIDs",
      buildTrucksGetByIdsArgs(ids),
    );
    for (const truck of trucksFromPayload(payload)) {
      truckCache.remember(truck.truckId, truck);
    }
  }

  const { kept, report } = summarizeManifestWindow(manifests, opts.from, opts.to);
  const shape =
    first.manifests.length === 0 ? `Payload: ${summarizePayloadShape(first.payload)}.` : null;
  const triedNote =
    first.manifests.length === 0 ? `Tried filters: ${triedLabels.join(", ")}.` : null;
  const payloadNote = [...notes, triedNote, shape]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  report.filterLabel = chosen.label;
  report.payloadNote = payloadNote ? payloadNote.slice(0, 800) : null;
  const driverMap: Record<string, string> = {};
  for (const [id, name] of drivers.entries()) driverMap[id] = name;
  const brokerMap: Record<string, string> = {};
  for (const [id, name] of brokers.entries()) brokerMap[id] = name;

  return {
    manifests: kept,
    lookups: {
      drivers: driverMap,
      brokers: brokerMap,
      trucks: Object.fromEntries(truckCache.entries()),
    },
    report,
  };
}
