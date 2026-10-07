import { findStop, resolveStopDate, timestampToDate, weekFieldsFromDeliveryDate } from "./dates";
import { classifyManifestEligibility, eligibilityIssue } from "./eligibility";
import { decimalStringToCents, decimalStringToMiles } from "./money";
import type { IssueDraft, MappedLoad, VektorManifest } from "./types";

export type TruckLookupRecord = {
  truckId: string;
  referenceId: string;
};

export type LookupMaps = {
  drivers: Record<string, string>;
  brokers: Record<string, string>;
  customers?: Record<string, string>;
  /** Keyed by Vektor truckId → referenceId ("02") */
  trucks?: Record<string, TruckLookupRecord>;
};

export function mapManifestToLoad(
  manifest: VektorManifest,
  lookups: LookupMaps = { drivers: {}, brokers: {} },
): MappedLoad {
  const issues: IssueDraft[] = [];
  const eligibility = classifyManifestEligibility(manifest);
  const skipIssue = eligibilityIssue(manifest, eligibility);
  if (skipIssue) issues.push(skipIssue);

  const pickup = findStop(manifest.stops, "pickup");
  const dropoff = findStop(manifest.stops, "dropoff");

  const pickupAt = resolveStopDate(pickup);
  const deliveryAt = resolveStopDate(dropoff);

  const orders = manifest.orders ?? [];
  const orderIds = [
    ...new Set(
      [
        ...orders.map((o) => o.orderId).filter(Boolean),
        ...(manifest.stops ?? []).map((s) => s.orderId).filter(Boolean),
      ] as string[],
    ),
  ];

  const orderFriendlyIds = [
    ...new Set(
      [
        ...orders.map((o) => o.friendlyId).filter(Boolean),
        ...(manifest.stops ?? []).map((s) => s.orderFriendlyId).filter(Boolean),
      ] as string[],
    ),
  ];

  let loadId: string | null = null;
  if (orderFriendlyIds.length === 1) {
    loadId = orderFriendlyIds[0]!;
  } else if (orderFriendlyIds.length > 1) {
    issues.push({
      severity: "Warn",
      rule: "multi_order_manifest",
      message:
        "Manifest has more than one order. Load ID left empty (OPEN). Rate is still on the manifest.",
      ref: manifest.friendlyId ?? manifest.manifestId,
      manifestId: manifest.manifestId,
    });
  }

  const brokerId =
    pickup?.orderBrokerId ??
    dropoff?.orderBrokerId ??
    orders[0]?.brokerId ??
    null;
  const customerId = orders[0]?.customerId ?? null;

  let rateCents = 0;
  try {
    rateCents = decimalStringToCents(manifest.grossAmount ?? "0");
  } catch {
    issues.push({
      severity: "Warn",
      rule: "invalid_gross_amount",
      message: `Could not parse manifest grossAmount: ${manifest.grossAmount}`,
      ref: manifest.friendlyId,
      manifestId: manifest.manifestId,
    });
  }

  const loadedDistanceMi = safeMiles(manifest.loadedDistance);
  const emptyDistanceMi = safeMiles(manifest.emptyDistance);
  const autoLoadedDistanceMi = safeMiles(manifest.autoLoadedDistance);
  const autoEmptyDistanceMi = safeMiles(manifest.autoEmptyDistance);

  const week =
    deliveryAt != null ? weekFieldsFromDeliveryDate(deliveryAt) : null;

  const driverId = manifest.primaryDriverId ?? null;
  const truckId = manifest.truckId ?? manifest.truck?.truckId ?? null;
  const truckRef =
    truckId && lookups.trucks?.[truckId]
      ? lookups.trucks[truckId]!.referenceId
      : null;

  let eligible = eligibility.importable;
  let skipReason = eligibility.reason;

  if (eligible && !deliveryAt) {
    eligible = false;
    skipReason = "no delivery date";
    issues.push({
      severity: "Warn",
      rule: "no_delivery_date",
      message:
        "No delivery date (checkedOutAt / arrivedAt / FIXED|RANGE appointment).",
      ref: manifest.friendlyId ?? manifest.manifestId,
      manifestId: manifest.manifestId,
    });
  }

  return {
    manifestId: manifest.manifestId,
    orderIds,
    loadId,
    manifestFriendlyId: manifest.friendlyId ?? null,
    pickupDate: pickupAt,
    deliveryDate: deliveryAt,
    weekStart: week?.weekStart ?? null,
    weekEnd: week?.weekEnd ?? null,
    monthKey: week?.monthKey ?? null,
    driverId,
    driverName: driverId ? (lookups.drivers[driverId] ?? null) : null,
    brokerId,
    brokerName: brokerId ? (lookups.brokers[brokerId] ?? null) : null,
    customerId,
    customerName:
      customerId && lookups.customers
        ? (lookups.customers[customerId] ?? null)
        : null,
    originCity: pickup?.location?.city ?? null,
    originState: pickup?.location?.state ?? null,
    destinationCity: dropoff?.location?.city ?? null,
    destinationState: dropoff?.location?.state ?? null,
    loadedDistanceMi,
    emptyDistanceMi,
    autoLoadedDistanceMi,
    autoEmptyDistanceMi,
    deadheadMiles: emptyDistanceMi,
    rateCents,
    truckId,
    truckUnitNumber: truckRef,
    vektorStatus: manifest.status,
    lineageRootManifestId: manifest.lineage?.rootManifestId ?? null,
    lineageParentManifestId: manifest.lineage?.parentManifestId ?? null,
    lineageRelatedManifestId: manifest.lineage?.relatedManifestId ?? null,
    lineageRelation: manifest.lineage?.relation ?? null,
    tripGroupId: null,
    primaryLoad: null,
    issues,
    eligible,
    skipReason,
  };
}

function safeMiles(value: string | null | undefined): number | null {
  try {
    return decimalStringToMiles(value);
  } catch {
    return null;
  }
}

/** Calendar date for DB date columns. */
export function mappedDeliveryCalendarDate(mapped: MappedLoad): string | null {
  return timestampToDate(mapped.deliveryDate);
}
