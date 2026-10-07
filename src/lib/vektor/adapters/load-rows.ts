import type { LookupMaps } from "../map";
import { isUuid, stableUuid } from "../stable-id";
import type { VektorManifest, VektorStop } from "../types";

export type LoadImportRow = {
  unitNumber: string;
  loadId: string;
  deliveryDay: string;
  pickupDay: string | null;
  rateCents: number;
  loadedMilesHundredths: number | null;
  deadheadMilesHundredths: number | null;
  origin: string | null;
  destination: string | null;
  driverName: string | null;
  brokerName: string | null;
  manifestId: string | null;
  status: string | null;
};

function centsToDecimal(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function hundredthsToDecimal(hundredths: number): string {
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

function place(raw: string | null): { city: string | null; state: string | null } {
  if (!raw) return { city: null, state: null };
  const text = raw.replace(/\u00a0/g, " ").trim();
  const index = text.lastIndexOf(",");
  if (index < 0) return { city: text || null, state: null };
  return {
    city: text.slice(0, index).trim() || null,
    state: text.slice(index + 1).trim() || null,
  };
}

function stop(
  type: "pickup" | "dropoff",
  day: string,
  where: { city: string | null; state: string | null },
  loadId: string,
): VektorStop {
  return {
    orderStopType: type,
    orderFriendlyId: loadId,
    checkedOutAt: `${day} 00:00:00`,
    location: { city: where.city, state: where.state },
  };
}

function normalizeStatus(raw: string | null): string {
  if (!raw) return "STATUS_DELIVERED";
  const text = raw.trim();
  if (/^status_delivered$/i.test(text) || text.toLowerCase() === "delivered") return "STATUS_DELIVERED";
  if (/^status_deleted$/i.test(text) || text.toLowerCase() === "deleted") return "STATUS_DELETED";
  if (text.toUpperCase().startsWith("STATUS_")) return text.toUpperCase();
  return `STATUS_${text.toUpperCase().replace(/\s+/g, "_")}`;
}

export function loadRowsToManifests(rows: LoadImportRow[]): {
  manifests: VektorManifest[];
  lookups: LookupMaps;
} {
  const lookups: LookupMaps = { drivers: {}, brokers: {}, trucks: {} };
  const manifests: VektorManifest[] = [];
  for (const row of rows) {
    const unit = row.unitNumber.trim();
    const loadId = row.loadId.trim();
    if (!unit || !loadId || !row.deliveryDay) continue;
    const truckId = stableUuid(`unit:${unit}`);
    lookups.trucks![truckId] = { truckId, referenceId: unit };
    let driverId: string | null = null;
    if (row.driverName) {
      driverId = stableUuid(`driver:${row.driverName.trim().toLowerCase()}`);
      lookups.drivers[driverId] = row.driverName.trim();
    }
    let brokerId: string | null = null;
    if (row.brokerName) {
      brokerId = stableUuid(`broker:${row.brokerName.trim().toLowerCase()}`);
      lookups.brokers[brokerId] = row.brokerName.trim();
    }
    const manifestId =
      row.manifestId && isUuid(row.manifestId) ? row.manifestId : stableUuid(`load:${unit}:${loadId}`);
    const origin = place(row.origin);
    const destination = place(row.destination);
    const stops: VektorStop[] = [];
    if (row.pickupDay) stops.push(stop("pickup", row.pickupDay, origin, loadId));
    stops.push(stop("dropoff", row.deliveryDay, destination, loadId));
    manifests.push({
      manifestId,
      friendlyId: loadId,
      status: normalizeStatus(row.status),
      grossAmount: centsToDecimal(row.rateCents),
      loadedDistance:
        row.loadedMilesHundredths == null ? null : hundredthsToDecimal(row.loadedMilesHundredths),
      emptyDistance:
        row.deadheadMilesHundredths == null ? null : hundredthsToDecimal(row.deadheadMilesHundredths),
      primaryDriverId: driverId,
      truckId,
      stops,
      orders: [{ friendlyId: loadId, brokerId }],
    });
  }
  return { manifests, lookups };
}
