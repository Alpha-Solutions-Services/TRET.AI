import { countedLoadedHundredths, layoutManifestGroups } from "@/lib/loads/manifest-miles";
import { centsPerLoadedMile, formatDieselMpg } from "@/lib/reports/format";

export type MetricLoad = {
  loadId: string;
  rateCents: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  tripRef: string | null;
  sheetPrimary?: boolean | null;
  /** False while the trip has not delivered. MPG stays blank until it does. */
  delivered: boolean;
};

export type LoadRpm = {
  loadId: string;
  /** This load's share of the trip RPM. The shares add up to the trip RPM. */
  rpmCents: number | null;
};

type Laid = MetricLoad & { manifestRole: "solo" | "primary" | "partial" };

function lay(loads: readonly MetricLoad[]): Laid[] {
  return layoutManifestGroups(
    loads.map((load) => ({
      ...load,
      manifestRef: load.tripRef,
      rankHundredths: load.loadedMilesHundredths,
      sheetPrimary: load.sheetPrimary ?? null,
    })),
  );
}

/** Loaded miles on the primary row, plus deadhead on that same row, counted once. */
export function tripMilesHundredths(loads: readonly MetricLoad[]): number {
  const laid = lay(loads);
  let total = 0;
  for (const load of laid) {
    total += countedLoadedHundredths(load.manifestRole, load.loadedMilesHundredths);
    if (load.manifestRole !== "partial") total += load.deadheadMilesHundredths;
  }
  return total;
}

export function mainTripMilesHundredths(loads: readonly MetricLoad[]): number {
  const laid = lay(loads);
  let total = 0;
  for (const load of laid) {
    total += countedLoadedHundredths(load.manifestRole, load.loadedMilesHundredths);
  }
  return total;
}

/**
 * RPM is rate divided by total truck miles (loaded plus deadhead).
 * Shared trip miles are counted once.
 * Each load's RPM is its rate divided by those trip miles, so the per-load figures add up to the trip RPM.
 */
export function assignLoadRpms(loads: readonly MetricLoad[]): LoadRpm[] {
  const groups = new Map<string, MetricLoad[]>();
  const laid = lay(loads);
  for (const load of laid) {
    const key = load.tripRef && laid.filter((row) => row.tripRef === load.tripRef).length > 1 ? load.tripRef : load.loadId;
    const list = groups.get(key) ?? [];
    list.push(load);
    groups.set(key, list);
  }
  const out: LoadRpm[] = [];
  for (const group of groups.values()) {
    const miles = tripMilesHundredths(group);
    for (const load of group) {
      out.push({
        loadId: load.loadId,
        rpmCents: miles === 0 ? null : centsPerLoadedMile(load.rateCents, miles),
      });
    }
  }
  return out;
}

export function tripRpmCents(loads: readonly MetricLoad[]): number | null {
  const miles = tripMilesHundredths(loads);
  const rate = loads.reduce((sum, load) => sum + load.rateCents, 0);
  if (miles === 0) return null;
  return centsPerLoadedMile(rate, miles);
}

export function loadRpmsAddUp(loads: readonly MetricLoad[]): boolean {
  const trip = tripRpmCents(loads);
  const parts = assignLoadRpms(loads);
  if (trip == null) return parts.every((part) => part.rpmCents == null);
  const sum = parts.reduce((total, part) => total + (part.rpmCents ?? 0), 0);
  return sum === trip;
}

/** Blank when any trip that has a counted load is still undelivered. Uses main trip miles. */
export function truckMpg(
  counted: readonly MetricLoad[],
  allLoads: readonly MetricLoad[],
  dieselGallonsMilli: number,
): string | null {
  const trips = new Set(counted.map((load) => load.tripRef).filter((ref): ref is string => Boolean(ref)));
  for (const trip of trips) {
    const members = allLoads.filter((load) => load.tripRef === trip);
    if (members.some((load) => !load.delivered)) return null;
  }
  if (counted.some((load) => !load.delivered)) return null;
  return formatDieselMpg(mainTripMilesHundredths(counted), dieselGallonsMilli);
}

export function fleetFromTrucks(
  trucks: readonly {
    grossCents: number;
    totalMilesHundredths: number;
    mainMilesHundredths: number;
    gallonsMilli: number;
    mpg: string | null;
  }[],
): { rpmCents: number | null; mpg: string | null } {
  let gross = 0;
  let miles = 0;
  let main = 0;
  let gallons = 0;
  for (const truck of trucks) {
    gross += truck.grossCents;
    miles += truck.totalMilesHundredths;
    if (truck.mpg != null) {
      main += truck.mainMilesHundredths;
      gallons += truck.gallonsMilli;
    }
  }
  return {
    rpmCents: centsPerLoadedMile(gross, miles),
    mpg: formatDieselMpg(main, gallons),
  };
}
