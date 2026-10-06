import { findStop, resolveStopDate, weekFieldsFromDeliveryDate } from "./dates";
import { classifyManifestEligibility, eligibilityIssue } from "./eligibility";
import { decimalStringToCents, decimalStringToMiles } from "./money";
import type { IssueDraft, MappedLoad, VektorManifest } from "./types";

export type LookupMaps = {
  drivers: Record<string, string>;
  brokers: Record<string, string>;
  customers?: Record<string, string>;
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

  const pickupDate = resolveStopDate(pickup);
  const deliveryDate = resolveStopDate(dropoff);

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
    deliveryDate != null ? weekFieldsFromDeliveryDate(deliveryDate) : null;

  const driverId = manifest.primaryDriverId ?? null;
  const truckUnitNumber = manifest.truck?.unitNumber ?? null;

  let eligible = eligibility.importable;
  let skipReason = eligibility.reason;

  if (eligible && !deliveryDate) {
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

  if (eligible && orderFriendlyIds.length > 1) {
    // Still promote with null loadId? Owner said Load ID = OPEN, do not guess.
    // Promote with null load_id is OK — rate is on manifest. Keep eligible.
  }

  return {
    manifestId: manifest.manifestId,
    orderIds,
    loadId,
    manifestFriendlyId: manifest.friendlyId ?? null,
    pickupDate,
    deliveryDate,
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
    truckUnitNumber,
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
