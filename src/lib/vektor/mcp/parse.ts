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

/** MCP tool results are usually `{ content: [{ type: "text", text }] }` or structuredContent. */
export function unwrapToolPayload(result: unknown): unknown {
  const record = asRecord(result);
  if (!record) return result;
  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent;
  }
  const content = record.content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        const row = asRecord(part);
        return row && row.type === "text" ? asString(row.text) : null;
      })
      .filter((part): part is string => Boolean(part))
      .join("");
    if (text) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }
  }
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

function manifestArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ["manifests", "items", "data", "results", "records"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (asString(record.manifestId) || asString(record.manifest_id)) return [record];
  return [];
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
  const manifestId = asString(record.manifestId) ?? asString(record.manifest_id);
  const status = asString(record.status);
  if (!manifestId || !status) return null;
  const truck = asRecord(record.truck);
  return {
    manifestId,
    friendlyId: asString(record.friendlyId) ?? asString(record.friendly_id) ?? undefined,
    status,
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
