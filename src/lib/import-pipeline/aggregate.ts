import { weekBoundsForDate } from "@/lib/fee-engine/week";
import { countedLoadedHundredths, layoutManifestGroups } from "@/lib/loads/manifest-miles";
import { milesToHundredths } from "@/lib/fuel-tolls/quantity";
import { formatDieselMpg } from "@/lib/reports/format";
import { unitKey } from "@/lib/sheets/mismatch";

export type AggregateFuel = {
  unitNumber: string;
  weekStart: string;
  weekEnd: string;
  loadId: string;
  tripId: string;
  product: "diesel" | "def";
  gallonsMilli: number;
  amountCents: number;
};

export type AggregateToll = {
  unitNumber: string;
  weekStart: string;
  weekEnd: string;
  loadId: string;
  amountCents: number;
};

export type AggregateMiles = {
  unitNumber: string;
  weekStart: string;
  weekEnd: string;
  loadId: string;
  tripId: string;
  manifestRef: string | null;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
};

export type LoadTotals = {
  unitNumber: string;
  weekStart: string;
  weekEnd: string;
  loadId: string;
  tripId: string;
  dieselGallonsMilli: number;
  dieselCostCents: number;
  defGallonsMilli: number;
  defCostCents: number;
  tollCents: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
};

export type TruckWeekTotals = {
  unitNumber: string;
  weekStart: string;
  weekEnd: string;
  dieselGallonsMilli: number;
  dieselCostCents: number;
  defGallonsMilli: number;
  defCostCents: number;
  /** Diesel plus DEF. This is the fuel line. */
  fuelCostCents: number;
  tollCents: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  dispatchMilesHundredths: number;
  /** Diesel gallons only. Null when miles or diesel gallons are zero. */
  mpgLabel: string | null;
  loads: LoadTotals[];
};

type Bucket = LoadTotals & { manifestRef: string | null; rankHundredths: number };

function emptyBucket(input: {
  unitNumber: string;
  weekStart: string;
  weekEnd: string;
  loadId: string;
  tripId: string;
}): Bucket {
  return {
    ...input,
    dieselGallonsMilli: 0,
    dieselCostCents: 0,
    defGallonsMilli: 0,
    defCostCents: 0,
    tollCents: 0,
    loadedMilesHundredths: 0,
    deadheadMilesHundredths: 0,
    manifestRef: null,
    rankHundredths: 0,
  };
}

function isDef(product: string): boolean {
  return product.trim().toLowerCase().startsWith("def");
}

/** Per truck, per load or trip, per week. Money and miles stay integers. */
export function buildTruckWeeks(input: {
  fuel: readonly AggregateFuel[];
  tolls: readonly AggregateToll[];
  miles: readonly AggregateMiles[];
}): TruckWeekTotals[] {
  const buckets = new Map<string, Bucket>();
  const keyFor = (unitNumber: string, weekStart: string, loadId: string) =>
    `${unitKey(unitNumber)}|${weekStart}|${loadId}`;

  function bucket(row: { unitNumber: string; weekStart: string; weekEnd: string; loadId: string; tripId?: string }): Bucket {
    const key = keyFor(row.unitNumber, row.weekStart, row.loadId);
    const existing = buckets.get(key);
    if (existing) {
      if (!existing.tripId && row.tripId) existing.tripId = row.tripId;
      return existing;
    }
    const created = emptyBucket({
      unitNumber: unitKey(row.unitNumber) || row.unitNumber,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      loadId: row.loadId,
      tripId: row.tripId ?? "",
    });
    buckets.set(key, created);
    return created;
  }

  for (const row of input.fuel) {
    const item = bucket(row);
    if (row.product === "def" || isDef(row.product)) {
      item.defGallonsMilli += row.gallonsMilli;
      item.defCostCents += row.amountCents;
    } else {
      item.dieselGallonsMilli += row.gallonsMilli;
      item.dieselCostCents += row.amountCents;
    }
  }
  for (const row of input.tolls) bucket(row).tollCents += row.amountCents;
  for (const row of input.miles) {
    const item = bucket(row);
    item.manifestRef = row.manifestRef;
    item.loadedMilesHundredths = row.loadedMilesHundredths;
    item.deadheadMilesHundredths = row.deadheadMilesHundredths;
    item.rankHundredths = row.loadedMilesHundredths;
  }

  const byTruckWeek = new Map<string, Bucket[]>();
  for (const row of buckets.values()) {
    const key = `${unitKey(row.unitNumber)}|${row.weekStart}`;
    const list = byTruckWeek.get(key) ?? [];
    list.push(row);
    byTruckWeek.set(key, list);
  }

  const weeks: TruckWeekTotals[] = [];
  for (const list of byTruckWeek.values()) {
    const laid = layoutManifestGroups(list);
    const loads: LoadTotals[] = laid.map((row) => ({
      unitNumber: row.unitNumber,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      loadId: row.loadId,
      tripId: row.manifestRole === "solo" ? "" : row.tripId,
      dieselGallonsMilli: row.dieselGallonsMilli,
      dieselCostCents: row.dieselCostCents,
      defGallonsMilli: row.defGallonsMilli,
      defCostCents: row.defCostCents,
      tollCents: row.tollCents,
      loadedMilesHundredths: countedLoadedHundredths(row.manifestRole, row.loadedMilesHundredths),
      deadheadMilesHundredths: row.deadheadMilesHundredths,
    }));
    const first = loads[0]!;
    const dieselGallonsMilli = loads.reduce((sum, row) => sum + row.dieselGallonsMilli, 0);
    const dieselCostCents = loads.reduce((sum, row) => sum + row.dieselCostCents, 0);
    const defGallonsMilli = loads.reduce((sum, row) => sum + row.defGallonsMilli, 0);
    const defCostCents = loads.reduce((sum, row) => sum + row.defCostCents, 0);
    const loadedMilesHundredths = loads.reduce((sum, row) => sum + row.loadedMilesHundredths, 0);
    const deadheadMilesHundredths = loads.reduce((sum, row) => sum + row.deadheadMilesHundredths, 0);
    const dispatchMilesHundredths = loadedMilesHundredths + deadheadMilesHundredths;
    weeks.push({
      unitNumber: first.unitNumber,
      weekStart: first.weekStart,
      weekEnd: first.weekEnd,
      dieselGallonsMilli,
      dieselCostCents,
      defGallonsMilli,
      defCostCents,
      fuelCostCents: dieselCostCents + defCostCents,
      tollCents: loads.reduce((sum, row) => sum + row.tollCents, 0),
      loadedMilesHundredths,
      deadheadMilesHundredths,
      dispatchMilesHundredths,
      mpgLabel: formatDieselMpg(dispatchMilesHundredths, dieselGallonsMilli),
      loads,
    });
  }
  weeks.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber) || a.weekStart.localeCompare(b.weekStart));
  return weeks;
}

/** Fuel line and toll line shared by the dashboard, the weekly report, and the sheet plans. */
export function displayedFuelToll(row: TruckWeekTotals): { fuelCents: number; tollCents: number } {
  return { fuelCents: row.fuelCostCents, tollCents: row.tollCents };
}

export function distanceStringToHundredths(raw: string | null | undefined): number {
  return milesToHundredths(raw);
}

export function weekForDay(day: string): { start: string; end: string } | null {
  try {
    const bounds = weekBoundsForDate(day);
    return { start: bounds.start, end: bounds.end };
  } catch {
    return null;
  }
}
