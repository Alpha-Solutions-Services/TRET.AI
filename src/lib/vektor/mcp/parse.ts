import type { LookupMaps, TruckLookupRecord } from "../map";
import type { VektorManifest, VektorOrder, VektorStop } from "../types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function contentJson(record: Record<string, unknown>): unknown | null {
  const content = record.content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => {
      const row = asRecord(part);
      return row && row.type === "text" ? asString(row.text) : null;
    })
    .filter((part): part is string => Boolean(part))
    .join("");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Tool error text, with bearer tokens removed. Null when the call is not flagged isError. */
export function mcpToolErrorText(result: unknown): string | null {
  const record = asRecord(result);
  if (!record || record.isError !== true) return null;
  const parsed = contentJson(record);
  const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed ?? "");
  const clean = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").trim();
  return (clean || "Vektor tool returned an error").slice(0, 400);
}

/**
 * MCP tool results are usually `{ content: [{ type: "text", text }] }` or structuredContent.
 * An empty structuredContent must not hide a text body that actually contains rows.
 */
export function unwrapToolPayload(result: unknown): unknown {
  const record = asRecord(result);
  if (!record) return result;
  const structured =
    record.structuredContent && typeof record.structuredContent === "object"
      ? record.structuredContent
      : null;
  const text = contentJson(record);
  if (structured && text && manifestArray(structured).length === 0 && manifestArray(text).length > 0) {
    return text;
  }
  if (structured) return structured;
  if (text) return text;
  return result;
}

export function nextPageToken(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  const direct =
    asString(record.next_page_token) ??
    asString(record.nextPageToken) ??
    asString(record.page_token) ??
    asString(record.pageToken);
  if (direct) return direct;
  const pagination = asRecord(record.pagination);
  if (!pagination) return null;
  return (
    asString(pagination.next_page_token) ??
    asString(pagination.nextPageToken) ??
    null
  );
}

const MANIFEST_LIST_KEYS = [
  "manifests",
  "items",
  "data",
  "results",
  "records",
  "rows",
  "list",
  "entries",
  "values",
] as const;

function arrayAt(record: Record<string, unknown>): unknown[] | null {
  for (const key of MANIFEST_LIST_KEYS) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return null;
}

function manifestArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const direct = arrayAt(record);
  if (direct) return direct;
  for (const key of ["data", "result", "response", "payload"]) {
    const nested = asRecord(record[key]);
    if (!nested) continue;
    const inner = arrayAt(nested);
    if (inner) return inner;
  }
  if (asString(record.manifestId) || asString(record.manifest_id) || asString(record.id)) {
    return [record];
  }
  return [];
}

/** Keys and lengths only. Never includes row values. */
export function summarizePayloadShape(payload: unknown): string {
  const parts: string[] = [];
  const noteRows = (label: string, rows: unknown[]) => {
    parts.push(`${label} length ${rows.length}`);
    const first = asRecord(rows[0]);
    if (rows.length > 0 && first) {
      parts.push(`${label} first row keys: ${Object.keys(first).slice(0, 16).join(", ")}`);
    }
  };
  if (Array.isArray(payload)) {
    noteRows("array", payload);
    return parts.join(". ").slice(0, 500);
  }
  const record = asRecord(payload);
  if (!record) return `type ${payload === null ? "null" : typeof payload}`;
  const keys = Object.keys(record).slice(0, 12);
  parts.push(`keys: ${keys.join(", ") || "(none)"}`);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) noteRows(key, value);
    const nested = asRecord(value);
    if (!nested) continue;
    const nestedKeys = Object.keys(nested).slice(0, 8);
    parts.push(`${key} object keys: ${nestedKeys.join(", ") || "(none)"}`);
    for (const nestedKey of nestedKeys) {
      const inner = nested[nestedKey];
      if (Array.isArray(inner)) noteRows(`${key}.${nestedKey}`, inner);
    }
  }
  return parts.join(". ").slice(0, 500);
}

function normalizeStatus(value: unknown): string | null {
  const record = asRecord(value);
  if (record) {
    return normalizeStatus(record.code ?? record.value ?? record.name ?? record.status ?? record.state);
  }
  const text = asString(value);
  if (!text) return null;
  const upper = text.toUpperCase().replace(/\s+/g, "_");
  if (upper === "DELIVERED" || upper === "STATUS_DELIVERED") return "STATUS_DELIVERED";
  if (upper === "DELETED" || upper === "STATUS_DELETED") return "STATUS_DELETED";
  if (upper.startsWith("STATUS_")) return upper;
  return text;
}

function statusFromRecord(record: Record<string, unknown>): string | null {
  const direct = normalizeStatus(
    record.status ?? record.manifestStatus ?? record.manifest_status ?? record.state ?? record.lifecycle,
  );
  if (direct) return direct;
  for (const key of Object.keys(record)) {
    if (!/status/i.test(key)) continue;
    const found = normalizeStatus(record[key]);
    if (found) return found;
  }
  return null;
}

function stopsFrom(value: unknown): VektorStop[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((row) => asRecord(row)) as VektorStop[];
}

function ordersFrom(value: unknown): VektorOrder[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((row) => asRecord(row)) as VektorOrder[];
}

export function toManifest(value: unknown): VektorManifest | null {
  const record = asRecord(value);
  if (!record) return null;
  const manifestId =
    asString(record.manifestId) ?? asString(record.manifest_id) ?? asString(record.id) ?? asString(record.uuid);
  const status = statusFromRecord(record);
  const looksLikeManifest = Boolean(
    record.stops || record.orders || record.grossAmount || record.gross_amount || record.friendlyId || record.friendly_id,
  );
  if (!manifestId || (!status && !looksLikeManifest)) return null;
  const truck = asRecord(record.truck);
  return {
    manifestId,
    friendlyId: asString(record.friendlyId) ?? asString(record.friendly_id) ?? undefined,
    status: status ?? "STATUS_UNKNOWN",
    customStatusId: asString(record.customStatusId),
    loadedDistance: asString(record.loadedDistance),
    emptyDistance: asString(record.emptyDistance),
    totalDistance: asString(record.totalDistance),
    autoLoadedDistance: asString(record.autoLoadedDistance),
    autoEmptyDistance: asString(record.autoEmptyDistance),
    grossAmount: asString(record.grossAmount) ?? asString(record.gross_amount),
    grossType: asString(record.grossType),
    ratePerDistance: asString(record.ratePerDistance),
    primaryDriverId: asString(record.primaryDriverId) ?? asString(record.primary_driver_id),
    truckId: asString(record.truckId) ?? asString(record.truck_id) ?? asString(truck?.truckId),
    truck: truck
      ? {
          unitNumber: asString(truck.unitNumber) ?? asString(truck.unit_number),
          truckId: asString(truck.truckId) ?? asString(truck.truck_id),
        }
      : null,
    tour: asRecord(record.tour),
    lineage: asRecord(record.lineage) as VektorManifest["lineage"],
    stops: stopsFrom(record.stops),
    orders: ordersFrom(record.orders),
  };
}

export function manifestsFromPayload(payload: unknown): VektorManifest[] {
  return manifestArray(payload)
    .map((row) => toManifest(row))
    .filter((row): row is VektorManifest => row !== null);
}

export function trucksFromPayload(payload: unknown): TruckLookupRecord[] {
  const rows = Array.isArray(payload)
    ? payload
    : (() => {
        const record = asRecord(payload);
        if (!record) return [];
        for (const key of ["trucks", "items", "data", "results"]) {
          if (Array.isArray(record[key])) return record[key] as unknown[];
        }
        return asString(record.truckId) || asString(record.id) ? [record] : [];
      })();
  const trucks: TruckLookupRecord[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const truckId = asString(record.truckId) ?? asString(record.truck_id) ?? asString(record.id);
    const referenceId =
      asString(record.referenceId) ??
      asString(record.reference_id) ??
      asString(record.unitNumber) ??
      asString(record.unit_number);
    if (!truckId || !referenceId) continue;
    trucks.push({ truckId, referenceId });
  }
  return trucks;
}

export function partyName(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

export function lookupsFromCaches(input: {
  trucks: TruckLookupRecord[];
  drivers: Record<string, string>;
  brokers: Record<string, string>;
}): LookupMaps {
  const trucks: Record<string, TruckLookupRecord> = {};
  for (const truck of input.trucks) {
    trucks[truck.truckId] = truck;
  }
  return {
    drivers: input.drivers,
    brokers: input.brokers,
    trucks,
  };
}
