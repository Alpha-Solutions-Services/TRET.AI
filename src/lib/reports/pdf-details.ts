import { unitNumberFromRaw } from "@/lib/fuel-tolls/file/mappings";
import { manifestGroupKey } from "@/lib/loads/manifest-miles";
import type { OwnerWeekLoad } from "@/lib/reports/owner-week";
import type { UnitStatement } from "@/lib/statements/types";
import type { ReportFuelRow, ReportLoadRow, ReportTollRow, WeeklyReportSource } from "./types";

export type SheetPdfTruck = {
  unitNumber: string;
  weekLoads?: readonly OwnerWeekLoad[];
  mpg?: string | null;
  mpgFromSheet?: boolean;
  tripOpen?: boolean;
  readable?: boolean;
  reportDieselGallonsMilli?: number;
  reportDefGallonsMilli?: number;
};

/**
 * The statement totals come from the sheet. Imported loads, fuel, and tolls
 * often do not. The PDF lists the sheet's delivered rows and uses fuel and
 * toll amounts that add up to the statement.
 */
export function alignPdfDetails(
  source: WeeklyReportSource,
  sheets: readonly SheetPdfTruck[],
): WeeklyReportSource {
  const loads: ReportLoadRow[] = [];
  const fuel: ReportFuelRow[] = [];
  const tolls: ReportTollRow[] = [];
  for (const unit of source.units) {
    const sheet = sheets.find((row) => unitNumberFromRaw(row.unitNumber) === unitNumberFromRaw(unit.unitNumber));
    loads.push(...loadsForUnit(unit, sheet?.weekLoads ?? [], source.loads));
    fuel.push(...fuelForUnit(unit, source.fuel, sheet));
    tolls.push(...tollsForUnit(unit, source.tolls));
  }
  return {
    ...source,
    loads,
    fuel,
    tolls,
    sheetUnits: sheets.map((row) => ({
      unitNumber: row.unitNumber,
      mpg: row.mpg?.trim() ? row.mpg.trim() : null,
      mpgKnown: Boolean(row.readable || row.mpgFromSheet || row.tripOpen || (row.mpg != null && row.mpg.trim() !== "")),
      mpgFromSheet: row.mpgFromSheet === true,
      tripOpen: row.tripOpen === true,
      mpgLoads: (row.weekLoads ?? []).map((load) => ({
        tripRef: (load.tripGroup || load.manifestId || "").trim() || null,
        deliveryDay: load.deliveryDay?.trim() || null,
      })),
    })),
  };
}

function loadsForUnit(
  unit: UnitStatement,
  weekLoads: readonly OwnerWeekLoad[],
  dbLoads: readonly ReportLoadRow[],
): ReportLoadRow[] {
  const delivered = weekLoads.filter((row) => row.status === "Delivered" && row.rateCents != null);
  const sheetGross = delivered.reduce((sum, row) => sum + (row.rateCents ?? 0), 0);
  const useSheet = delivered.length === unit.loadCount && sheetGross === unit.grossCents;
  const tripCounts = new Map<string, number>();
  for (const row of weekLoads) {
    const key = manifestGroupKey(row.tripGroup || row.manifestId);
    if (!key) continue;
    tripCounts.set(key, (tripCounts.get(key) ?? 0) + 1);
  }
  const base: ReportLoadRow[] = useSheet
    ? delivered.map((row) => {
        const tripKey = (row.tripGroup || row.manifestId || "").trim() || null;
        const group = manifestGroupKey(tripKey);
        return {
          truckId: unit.truckId,
          loadNumber: row.loadId,
          deliveryDate: row.deliveryDay,
          brokerName: null,
          origin: row.origin,
          destination: row.destination,
          loadedMilesHundredths: Math.max(0, row.loadedMilesHundredths ?? 0),
          deadheadMilesHundredths: Math.max(0, row.deadheadMilesHundredths ?? 0),
          rateCents: row.rateCents ?? 0,
          tableLoadedMilesHundredths:
            row.ledgerMilesHundredths != null
              ? Math.max(0, row.ledgerMilesHundredths)
              : Math.max(0, row.loadedMilesHundredths ?? 0),
          tripKey,
          inSharedTrip: group != null && (tripCounts.get(group) ?? 0) > 1,
        };
      })
    : dbLoads.filter((row) => row.truckId === unit.truckId).map((row) => ({ ...row }));
  return fitMiles(base, unit);
}

function fitMiles(rows: ReportLoadRow[], unit: UnitStatement): ReportLoadRow[] {
  if (rows.length === 0) return rows;
  const next = rows.map((row) => ({ ...row }));
  applyDelta(
    next,
    unit.loadedMilesHundredths,
    (row) => row.loadedMilesHundredths,
    (row, value) => {
      row.loadedMilesHundredths = value;
    },
  );
  applyDelta(
    next,
    unit.deadheadMilesHundredths,
    (row) => row.deadheadMilesHundredths,
    (row, value) => {
      row.deadheadMilesHundredths = value;
    },
  );
  return next;
}

function applyDelta(
  rows: ReportLoadRow[],
  target: number,
  read: (row: ReportLoadRow) => number,
  write: (row: ReportLoadRow, value: number) => void,
): void {
  const current = rows.reduce((sum, row) => sum + read(row), 0);
  const last = rows[rows.length - 1]!;
  const delta = target - current;
  if (read(last) + delta >= 0) {
    write(last, read(last) + delta);
    return;
  }
  for (const row of rows) write(row, 0);
  write(last, target);
}

function fuelForUnit(
  unit: UnitStatement,
  rows: readonly ReportFuelRow[],
  sheet: SheetPdfTruck | undefined,
): ReportFuelRow[] {
  const diesel = sheetGallons(sheet?.reportDieselGallonsMilli);
  const def = sheetGallons(sheet?.reportDefGallonsMilli);
  if (diesel > 0 || def > 0) return sheetFuelRows(unit, diesel, def);
  const own = rows.filter((row) => row.unitNumber === unit.unitNumber);
  const amount = own.reduce((sum, row) => sum + row.amountCents, 0);
  const productsOk = own.every((row) => row.product === "diesel" || row.product === "def" || row.product === "other");
  if (own.length > 0 && amount === unit.fuelCents && productsOk) return own.map((row) => ({ ...row }));
  if (unit.fuelCents === 0) return [];
  const gallons = own.filter((row) => row.product === "diesel").reduce((sum, row) => sum + row.gallonsMilli, 0);
  return [{ unitNumber: unit.unitNumber, amountCents: unit.fuelCents, gallonsMilli: gallons, product: "diesel" }];
}

function sheetGallons(value: number | undefined): number {
  if (value == null || !Number.isInteger(value) || value <= 0) return 0;
  return value;
}

/** Sheet gallons, with the statement fuel dollars on the diesel row so the total still matches. */
function sheetFuelRows(unit: UnitStatement, dieselMilli: number, defMilli: number): ReportFuelRow[] {
  const rows: ReportFuelRow[] = [];
  if (dieselMilli > 0 || unit.fuelCents > 0) {
    rows.push({
      unitNumber: unit.unitNumber,
      amountCents: unit.fuelCents,
      gallonsMilli: dieselMilli,
      product: "diesel",
    });
  }
  if (defMilli > 0) {
    rows.push({ unitNumber: unit.unitNumber, amountCents: 0, gallonsMilli: defMilli, product: "def" });
  }
  return rows;
}

function tollsForUnit(unit: UnitStatement, rows: readonly ReportTollRow[]): ReportTollRow[] {
  const own = rows.filter((row) => row.unitNumber === unit.unitNumber);
  const amount = own.reduce((sum, row) => sum + row.amountCents, 0);
  if (own.length > 0 && amount === unit.tollsCents) return own.map((row) => ({ ...row }));
  if (unit.tollsCents === 0) return [];
  return [{ unitNumber: unit.unitNumber, amountCents: unit.tollsCents }];
}
