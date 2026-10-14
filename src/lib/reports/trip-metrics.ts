import { countedLoadedHundredths, layoutManifestGroups, manifestGroupKey } from "@/lib/loads/manifest-miles";
import { centsPerLoadedMile, formatDieselMpg } from "@/lib/reports/format";

export type MetricLoad = {
  loadId: string;
  rateCents: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  tripRef: string | null;
  sheetPrimary?: boolean | null;
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

/** Week Report C31, or blank. A 0 cell is blank. */
export function sheetMpgText(mpg: string | null | undefined): string | null {
  const text = mpg?.trim() ?? "";
  if (!text || text === "0" || text === "0.00") return null;
  return text;
}

export type WeekMpgLoad = {
  tripRef: string | null;
  /** ISO delivery date. Null when the load has not delivered. */
  deliveryDay: string | null;
};

/**
 * A trip is open for this week when one of its loads delivered on or before Sunday
 * and another has not. The clock date is not used.
 */
export function tripOpenAtSunday(loads: readonly WeekMpgLoad[], weekEnd: string): boolean {
  const groups = new Map<string, { inWeek: boolean; later: boolean }>();
  loads.forEach((load, index) => {
    const key = manifestGroupKey(load.tripRef) ?? `load:${index}`;
    const state = groups.get(key) ?? { inWeek: false, later: false };
    const day = load.deliveryDay?.trim() || null;
    if (day && day <= weekEnd) state.inWeek = true;
    else state.later = true;
    groups.set(key, state);
  });
  for (const state of groups.values()) {
    if (state.inWeek && state.later) return true;
  }
  return false;
}

/**
 * The one MPG figure for the dashboard, the owner PDF, and the statement.
 * Gallons are diesel only. Miles are already counted once per trip.
 * While the trip is open, the figure is Week Report C31, or blank when that cell is empty.
 */
export function weekMpg(input: {
  tripOpen: boolean;
  /** Truck miles already counted once per trip. */
  truckMilesHundredths: number;
  dieselGallonsMilli: number;
  sheetMpg?: string | null;
}): string | null {
  if (input.tripOpen) return sheetMpgText(input.sheetMpg);
  return formatDieselMpg(input.truckMilesHundredths, input.dieselGallonsMilli);
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
  for (const truck of trucks) {
    gross += truck.grossCents;
    miles += truck.totalMilesHundredths;
  }
  return {
    rpmCents: centsPerLoadedMile(gross, miles),
    mpg: fleetMpgFromTrucks(
      trucks.map((truck) => ({
        truckMilesHundredths: truck.totalMilesHundredths,
        gallonsMilli: truck.gallonsMilli,
      })),
    ),
  };
}

/**
 * Fleet MPG for the dashboard and the owner PDF.
 * All fleet truck miles divided by all diesel gallons.
 * A truck whose own MPG is blank still counts, when it has miles or gallons.
 */
export function fleetMpgFromTrucks(
  trucks: readonly { truckMilesHundredths: number; gallonsMilli: number }[],
): string | null {
  let miles = 0;
  let gallons = 0;
  for (const truck of trucks) {
    miles += truck.truckMilesHundredths;
    gallons += truck.gallonsMilli;
  }
  return formatDieselMpg(miles, gallons);
}
