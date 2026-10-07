import { createVektorClient, VektorClientError } from "../client";
import { isUuid, stableUuid } from "../stable-id";
import type { LookupMaps } from "../map";
import type { ImportWindowReport } from "../mcp/window";
import type { VektorManifest } from "../types";
import { sheetAmountToCents, sheetDay } from "@/lib/sheets/cell";
import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

/**
 * REST list paths are OPEN until Vektor confirms them.
 * Probes are GET only. This adapter never calls MCP.
 */
export const OPEN_MANIFEST_PATHS = [
  "/manifests?status=delivered&from={from}&to={to}&page={page}&perPage={perPage}",
  "/v1/manifests?status=delivered&from={from}&to={to}&page={page}&perPage={perPage}",
  "/api/v1/manifests?status=delivered&from={from}&to={to}&page={page}&perPage={perPage}",
] as const;

const MAX_PAGES = 10;

export class ApiAdapter implements ImportSourceAdapter {
  readonly id = "api" as const;

  constructor(
    private readonly opts: {
      baseUrl: string;
      token: string;
      pathTemplate?: string;
      fetchImpl?: typeof fetch;
    } = { baseUrl: "", token: "" },
  ) {}

  status(): AdapterStatus {
    if (!this.opts.baseUrl.trim() || !this.opts.token.trim()) {
      return {
        id: "api",
        label: "Vektor REST API",
        selectable: false,
        configured: false,
        message:
          "Not configured. Set VEKTOR_API_BASE_URL and VEKTOR_API_TOKEN. This source is not called until both are set. The list path is OPEN. This path never calls MCP.",
      };
    }
    const path = this.opts.pathTemplate?.trim();
    return {
      id: "api",
      label: "Vektor REST API",
      selectable: true,
      configured: true,
      message: path
        ? "Ready. Uses VEKTOR_API_MANIFESTS_PATH with the REST client. This path never calls MCP."
        : "Ready. REST list path is OPEN, so Import probes a short list of GET paths and stops on the first manifest list. Set VEKTOR_API_MANIFESTS_PATH to skip probing. This path never calls MCP.",
    };
  }

  async fetchManifests(input: FetchManifestsInput): Promise<FetchManifestsResult> {
    const status = this.status();
    if (!status.selectable) throw new Error(status.message);
    const client = createVektorClient({
      baseUrl: this.opts.baseUrl,
      token: this.opts.token,
      fetchImpl: this.opts.fetchImpl,
    });
    const explicit = this.opts.pathTemplate?.trim() ?? "";
    const templates = explicit ? [explicit] : [...OPEN_MANIFEST_PATHS];
    const attempts: string[] = [];
    let chosen: string | null = null;
    let manifests: VektorManifest[] = [];
    const lookups: LookupMaps = { drivers: {}, brokers: {}, trucks: {} };
    for (const template of templates) {
      const label = template.split("?")[0] ?? template;
      try {
        const page = await collectPages(client, template, input);
        attempts.push(`${label} HTTP ${page.status}`);
        if (page.manifests) {
          chosen = label;
          manifests = page.manifests;
          mergeLookups(lookups, page.lookups);
          break;
        }
      } catch (err) {
        if (err instanceof VektorClientError && (err.status === 401 || err.status === 403)) {
          throw new Error(`Vektor REST rejected the token (HTTP ${err.status}). MCP was not called.`);
        }
        const http = err instanceof VektorClientError && err.status ? ` HTTP ${err.status}` : "";
        attempts.push(`${label}${http || " failed"}`);
        if (explicit) break;
      }
    }
    if (!chosen) {
      throw new Error(
        `Vektor REST list path is OPEN. Probed GET ${attempts.join("; ")}. None returned a manifest list. Set VEKTOR_API_MANIFESTS_PATH. MCP was not called.`,
      );
    }
    const report: ImportWindowReport = {
      queryFrom: input.from,
      queryTo: input.to,
      rangeFrom: input.from,
      rangeTo: input.to,
      fetchedInWindow: manifests.length,
      deliveredByFirstStopDate: 0,
      deliveredByDeliveryDate: manifests.length,
      keptForImport: manifests.length,
      statusCounts: {},
      filterLabel: chosen,
      payloadNote: explicit ? null : `REST path is OPEN. Probe used ${chosen}. MCP was not called.`,
    };
    return { manifests, lookups, report };
  }
}

async function collectPages(
  client: ReturnType<typeof createVektorClient>,
  template: string,
  input: FetchManifestsInput,
): Promise<{ status: number; manifests: VektorManifest[] | null; lookups: LookupMaps }> {
  const lookups: LookupMaps = { drivers: {}, brokers: {}, trucks: {} };
  const manifests: VektorManifest[] = [];
  let recognized = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = fillPath(template, { ...input, page, perPage: 25 });
    const body = await client.listDeliveredManifests({
      from: input.from,
      to: input.to,
      page,
      perPage: 25,
      pathTemplate: path,
    });
    const extracted = extractManifestArray(body);
    if (!extracted) {
      if (page === 1) return { status: 200, manifests: null, lookups };
      break;
    }
    recognized = true;
    for (const row of extracted) {
      const manifest = normalizeManifest(row, lookups);
      if (manifest) manifests.push(manifest);
    }
    if (extracted.length < 25) break;
  }
  return { status: 200, manifests: recognized ? manifests : null, lookups };
}

function fillPath(
  template: string,
  input: { from: string; to: string; page: number; perPage: number },
): string {
  return template
    .replaceAll("{from}", encodeURIComponent(input.from))
    .replaceAll("{to}", encodeURIComponent(input.to))
    .replaceAll("{page}", String(input.page))
    .replaceAll("{perPage}", String(input.perPage));
}

function extractManifestArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  for (const key of ["manifests", "data", "items", "results", "records"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function centsToDecimal(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function normalizeManifest(row: unknown, lookups: LookupMaps): VektorManifest | null {
  const record = asRecord(row);
  if (!record) return null;
  const rawId = stringField(record, ["manifestId", "manifest_id", "id"]);
  if (!rawId) return null;
  const manifestId = isUuid(rawId) ? rawId : stableUuid(`api:${rawId}`);
  const statusRaw = stringField(record, ["status"]);
  const status =
    !statusRaw || statusRaw.toLowerCase() === "delivered" || statusRaw === "STATUS_DELIVERED"
      ? "STATUS_DELIVERED"
      : statusRaw.toUpperCase().startsWith("STATUS_")
        ? statusRaw.toUpperCase()
        : `STATUS_${statusRaw.toUpperCase()}`;
  const truck = asRecord(record.truck);
  const truckId = stringField(record, ["truckId", "truck_id"]) ?? (truck ? stringField(truck, ["truckId", "truck_id", "id"]) : null);
  const unit =
    stringField(record, ["unitNumber", "unit_number", "referenceId", "reference_id"]) ??
    (truck ? stringField(truck, ["unitNumber", "unit_number", "referenceId", "reference_id"]) : null);
  const resolvedTruckId = truckId
    ? isUuid(truckId)
      ? truckId
      : stableUuid(`api-truck:${truckId}`)
    : unit
      ? stableUuid(`api-unit:${unit}`)
      : null;
  if (resolvedTruckId && unit) {
    lookups.trucks = lookups.trucks ?? {};
    lookups.trucks[resolvedTruckId] = { truckId: resolvedTruckId, referenceId: unit };
  }
  const base = record as unknown as VektorManifest;
  const friendlyId = stringField(record, ["friendlyId", "friendly_id"]) ?? (isUuid(rawId) ? null : rawId);
  let grossAmount = stringField(record, ["grossAmount", "gross_amount", "rate"]);
  if (grossAmount && sheetAmountToCents(grossAmount) != null && !/^-?\d+(\.\d{1,2})?$/.test(grossAmount)) {
    grossAmount = centsToDecimal(sheetAmountToCents(grossAmount)!);
  }
  const delivery = stringField(record, ["deliveryDate", "delivery_date", "deliveredAt", "delivered_at"]);
  const day = delivery ? sheetDay(delivery) : null;
  const stops = Array.isArray(record.stops)
    ? (record.stops as VektorManifest["stops"])
    : day
      ? [{ orderStopType: "dropoff", checkedOutAt: `${day} 00:00:00` }]
      : base.stops;
  return {
    ...base,
    manifestId,
    friendlyId: friendlyId ?? base.friendlyId,
    status,
    grossAmount: grossAmount ?? base.grossAmount,
    truckId: resolvedTruckId ?? base.truckId,
    stops,
  };
}

function mergeLookups(target: LookupMaps, extra: LookupMaps): void {
  target.trucks = { ...(target.trucks ?? {}), ...(extra.trucks ?? {}) };
  Object.assign(target.drivers, extra.drivers);
  Object.assign(target.brokers, extra.brokers);
}
