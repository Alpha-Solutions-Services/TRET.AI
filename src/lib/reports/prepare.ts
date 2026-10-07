import { assertInteger, assertNonNegativeInteger } from "@/lib/fee-engine/money";
import { bpToPercentString } from "@/lib/fees/percent";
import { truckClassLabel } from "@/lib/fees/kinds";
import { expectedNetCents, ownerDeductionCents } from "@/lib/statements/engine";
import type { FleetStatement, StatementLine, UnitStatement } from "@/lib/statements/types";
import {
  centsPerLoad,
  centsPerLoadedMile,
  formatDieselMpg,
  formatGallonsMilli,
  formatMilesHundredths,
  formatStatementDollars,
} from "./format";
import type {
  PreparedLoad,
  PreparedPair,
  PreparedReport,
  PreparedUnit,
  ReportFuelRow,
  ReportLoadRow,
  WeeklyReportSource,
} from "./types";

export const NOT_STORED = "Not stored";

export class ReportBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportBlockedError";
  }
}

const FLEET_NOTE =
  "Managed trucks deduct one management fee. Tolson payable and Legacy retained on those trucks are internal and are not deducted again. Fuel is the discounted amount.";

export function prepareWeeklyReport(source: WeeklyReportSource): PreparedReport {
  if (source.units.length === 0) {
    throw new ReportBlockedError("Nothing to show for this week.");
  }
  if (source.weekEnd < source.weekStart) {
    throw new ReportBlockedError("Week end is before week start.");
  }

  const seen = new Set<string>();
  for (const unit of source.units) {
    if (seen.has(unit.truckId)) {
      throw new ReportBlockedError(`Unit ${unit.unitNumber} is listed twice.`);
    }
    seen.add(unit.truckId);
    assertUnit(unit);
  }
  assertFleet(source.units, source.fleet);

  const units = source.units.map((unit) => prepareUnit(unit, source));
  return {
    weekStart: source.weekStart,
    weekEnd: source.weekEnd,
    statusLabel: source.locked
      ? `Locked${source.closedAt ? ` ${source.closedAt.slice(0, 10)}` : ""}`
      : "Computed, not locked",
    units,
    fleetRows: fleetRows(source.fleet),
    fleetNote: FLEET_NOTE,
  };
}

function assertUnit(unit: UnitStatement): void {
  assertNonNegativeInteger(unit.grossCents, "gross");
  assertNonNegativeInteger(unit.driverPayCents, "driver");
  assertNonNegativeInteger(unit.managementFeeCents, "management");
  assertNonNegativeInteger(unit.tolsonPayableCents, "tolson");
  assertNonNegativeInteger(unit.legacyRetainedCents, "legacy retained");
  assertNonNegativeInteger(unit.dispatchFeeCents, "dispatch");
  assertNonNegativeInteger(unit.factoringFeeCents, "factoring");
  assertNonNegativeInteger(unit.fuelCents, "fuel");
  assertNonNegativeInteger(unit.tollsCents, "tolls");
  assertNonNegativeInteger(unit.fixedOwnerCents, "fixed owner");
  assertNonNegativeInteger(unit.fixedManagementCents, "fixed management");
  assertInteger(unit.netCents, "net");
  assertNonNegativeInteger(unit.loadCount, "load count");
  assertNonNegativeInteger(unit.loadedMilesHundredths, "loaded miles");
  assertNonNegativeInteger(unit.deadheadMilesHundredths, "deadhead");
  if (unit.netCents !== expectedNetCents(unit)) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} net does not match gross minus owner deductions.`);
  }
  const ownerLines = unit.lines.filter((line) => line.ownerVisible && line.chargedTo === "owner");
  const lineSum = sumLineAmounts(ownerLines, `unit ${unit.unitNumber} lines`);
  if (lineSum !== ownerDeductionCents(unit)) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} lines do not add up to the owner deductions.`);
  }
  requireLine(unit, "FUEL", unit.fuelCents);
  requireLine(unit, "TOLLS", unit.tollsCents);
  const fixedOwner = sumCharged(unit, "owner");
  const fixedManagement = sumCharged(unit, "management");
  if (fixedOwner !== unit.fixedOwnerCents || fixedManagement !== unit.fixedManagementCents) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} fixed expenses do not match the statement.`);
  }
  requireFee(unit, "DRIVER_PAY", unit.driverPayCents);
  requireFee(unit, "MANAGEMENT_FEE", unit.managementFeeCents);
  requireFee(unit, "TOLSON_PAYABLE", unit.tolsonPayableCents);
  requireFee(unit, "LEGACY_RETAINED", unit.legacyRetainedCents);
  requireFee(unit, "DISPATCH_FEE", unit.dispatchFeeCents);
  requireFee(unit, "FACTORING_FEE", unit.factoringFeeCents);
}

function assertFleet(units: UnitStatement[], fleet: FleetStatement): void {
  const totals = {
    grossCents: 0,
    driverPayCents: 0,
    managementFeeCents: 0,
    tolsonPayableCents: 0,
    legacyRetainedCents: 0,
    dispatchFeeCents: 0,
    factoringFeeCents: 0,
    fuelCents: 0,
    tollsCents: 0,
    fixedOwnerCents: 0,
    fixedManagementCents: 0,
    netCents: 0,
    loadCount: 0,
  };
  for (const unit of units) {
    totals.grossCents += unit.grossCents;
    totals.driverPayCents += unit.driverPayCents;
    totals.managementFeeCents += unit.managementFeeCents;
    totals.tolsonPayableCents += unit.tolsonPayableCents;
    totals.legacyRetainedCents += unit.legacyRetainedCents;
    totals.dispatchFeeCents += unit.dispatchFeeCents;
    totals.factoringFeeCents += unit.factoringFeeCents;
    totals.fuelCents += unit.fuelCents;
    totals.tollsCents += unit.tollsCents;
    totals.fixedOwnerCents += unit.fixedOwnerCents;
    totals.fixedManagementCents += unit.fixedManagementCents;
    totals.netCents += unit.netCents;
    totals.loadCount += unit.loadCount;
  }
  const checks: Array<[number, number, string]> = [
    [fleet.grossCents, totals.grossCents, "gross"],
    [fleet.driverPayCents, totals.driverPayCents, "driver"],
    [fleet.managementFeeCents, totals.managementFeeCents, "management"],
    [fleet.tolsonPayableCents, totals.tolsonPayableCents, "tolson"],
    [fleet.legacyRetainedCents, totals.legacyRetainedCents, "legacy retained"],
    [fleet.dispatchFeeCents, totals.dispatchFeeCents, "dispatch"],
    [fleet.factoringFeeCents, totals.factoringFeeCents, "factoring"],
    [fleet.fuelCents, totals.fuelCents, "fuel"],
    [fleet.tollsCents, totals.tollsCents, "tolls"],
    [fleet.fixedOwnerCents, totals.fixedOwnerCents, "fixed owner"],
    [fleet.fixedManagementCents, totals.fixedManagementCents, "fixed management"],
    [fleet.netCents, totals.netCents, "net"],
    [fleet.loadCount, totals.loadCount, "loads"],
    [fleet.unitCount, units.length, "units"],
  ];
  for (const [actual, expected, label] of checks) {
    assertInteger(actual, `fleet ${label}`);
    if (actual !== expected) {
      throw new ReportBlockedError(`Fleet ${label} does not match the units.`);
    }
  }
}

function prepareUnit(unit: UnitStatement, source: WeeklyReportSource): PreparedUnit {
  const header = source.trucks.find((truck) => truck.id === unit.truckId);
  const loads = source.loads.filter((load) => load.truckId === unit.truckId);
  const otherTruckLoads = source.loads.filter((load) => !source.units.some((row) => row.truckId === load.truckId));
  if (otherTruckLoads.length > 0) {
    throw new ReportBlockedError("A load in this week is not on the statement.");
  }
  assertLoads(unit, loads);

  const fuel = source.fuel.filter((row) => row.unitNumber === unit.unitNumber);
  const tolls = source.tolls.filter((row) => row.unitNumber === unit.unitNumber);
  assertFuel(unit, fuel);
  assertTolls(unit, tolls);
  assertNoStrayFuelOrTolls(source);

  const dieselMilli = sumGallons(fuel, "diesel");
  const defMilli = sumGallons(fuel, "def");
  const otherMilli = sumGallons(fuel, "other");
  const ratePerMile = centsPerLoadedMile(unit.grossCents, unit.loadedMilesHundredths);
  const fuelPerMile = centsPerLoadedMile(unit.fuelCents, unit.loadedMilesHundredths);
  const perLoad = centsPerLoad(unit.grossCents, unit.loadCount);
  const mpg = formatDieselMpg(unit.loadedMilesHundredths, dieselMilli);

  const ownerLines = unit.lines
    .filter((line) => line.ownerVisible && line.chargedTo === "owner" && line.amountCents !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const managementLines = unit.lines
    .filter((line) => line.chargedTo === "management" && line.amountCents !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    unitNumber: unit.unitNumber,
    truckClassLabel: truckClassLabel(unit.truckClass),
    assetPartner: header?.ownerName?.trim() ? header.ownerName.trim() : NOT_STORED,
    truckLabel: header?.name?.trim() ? `${unit.unitNumber} ${header.name.trim()}` : unit.unitNumber,
    trailer: NOT_STORED,
    vin: NOT_STORED,
    dispatcher: NOT_STORED,
    loads: loads.map(presentLoad),
    loadTotals:
      loads.length === 0
        ? null
        : {
            loaded: formatMilesHundredths(unit.loadedMilesHundredths),
            deadhead: formatMilesHundredths(unit.deadheadMilesHundredths),
            rate: formatStatementDollars(unit.grossCents),
          },
    performance: [
      { label: "Loads", value: String(unit.loadCount) },
      { label: "Loaded miles", value: formatMilesHundredths(unit.loadedMilesHundredths) },
      { label: "Deadhead miles", value: formatMilesHundredths(unit.deadheadMilesHundredths) },
      {
        label: "Total miles",
        value: formatMilesHundredths(unit.loadedMilesHundredths + unit.deadheadMilesHundredths),
      },
      { label: "Revenue per load", value: perLoad == null ? "—" : formatStatementDollars(perLoad) },
      { label: "Rate per loaded mile", value: ratePerMile == null ? "—" : formatStatementDollars(ratePerMile) },
      {
        label: "Fuel cost per loaded mile",
        value: fuelPerMile == null ? "—" : formatStatementDollars(fuelPerMile),
      },
      { label: "MPG (diesel, loaded miles)", value: mpg ?? NOT_STORED },
    ],
    earnings: [{ label: "Gross", value: formatStatementDollars(unit.grossCents) }, ...ownerLines.map(presentEarning)],
    net: { label: "Net to owner", value: formatStatementDollars(unit.netCents) },
    fuelSummary: [
      { label: "Discounted fuel (booked)", value: formatStatementDollars(unit.fuelCents) },
      { label: "Diesel gallons", value: formatGallonsMilli(dieselMilli) },
      { label: "DEF gallons", value: formatGallonsMilli(defMilli) },
      ...(otherMilli > 0 ? [{ label: "Other fuel gallons", value: formatGallonsMilli(otherMilli) }] : []),
    ],
    fixedManagement: managementLines.map(presentEarning),
    compliance: NOT_STORED,
    operationsNote: NOT_STORED,
  };
}

function assertLoads(unit: UnitStatement, loads: ReportLoadRow[]): void {
  let gross = 0;
  let loaded = 0;
  let deadhead = 0;
  for (const load of loads) {
    assertNonNegativeInteger(load.rateCents, "load rate");
    assertNonNegativeInteger(load.loadedMilesHundredths, "load miles");
    assertNonNegativeInteger(load.deadheadMilesHundredths, "load deadhead");
    gross += load.rateCents;
    loaded += load.loadedMilesHundredths;
    deadhead += load.deadheadMilesHundredths;
  }
  if (loads.length !== unit.loadCount || gross !== unit.grossCents) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} load gross does not match the statement.`);
  }
  if (loaded !== unit.loadedMilesHundredths || deadhead !== unit.deadheadMilesHundredths) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} miles do not match the statement.`);
  }
}

function assertFuel(unit: UnitStatement, rows: ReportFuelRow[]): void {
  let amount = 0;
  for (const row of rows) {
    assertNonNegativeInteger(row.amountCents, "fuel amount");
    assertNonNegativeInteger(row.gallonsMilli, "fuel gallons");
    if (row.product !== "diesel" && row.product !== "def" && row.product !== "other") {
      throw new ReportBlockedError(`Unit ${unit.unitNumber} has a fuel product that is not diesel, DEF, or other.`);
    }
    amount += row.amountCents;
  }
  if (amount !== unit.fuelCents) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} discounted fuel does not match the statement.`);
  }
}

function assertTolls(unit: UnitStatement, rows: Array<{ amountCents: number }>): void {
  let amount = 0;
  for (const row of rows) {
    assertNonNegativeInteger(row.amountCents, "toll amount");
    amount += row.amountCents;
  }
  if (amount !== unit.tollsCents) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} tolls do not match the statement.`);
  }
}

function assertNoStrayFuelOrTolls(source: WeeklyReportSource): void {
  const units = new Set(source.units.map((unit) => unit.unitNumber));
  for (const row of source.fuel) {
    if (row.amountCents === 0) continue;
    if (!row.unitNumber || !units.has(row.unitNumber)) {
      throw new ReportBlockedError("Fuel in this week is not on a statement unit.");
    }
  }
  for (const row of source.tolls) {
    if (row.amountCents === 0) continue;
    if (!row.unitNumber || !units.has(row.unitNumber)) {
      throw new ReportBlockedError("A toll in this week is not on a statement unit.");
    }
  }
}

function presentLoad(load: ReportLoadRow): PreparedLoad {
  return {
    loadNumber: load.loadNumber?.trim() ? load.loadNumber.trim() : "—",
    deliveryDate: load.deliveryDate,
    broker: load.brokerName?.trim() ? load.brokerName.trim() : "—",
    origin: load.origin?.trim() ? load.origin.trim() : "—",
    destination: load.destination?.trim() ? load.destination.trim() : "—",
    loaded: formatMilesHundredths(load.loadedMilesHundredths),
    deadhead: formatMilesHundredths(load.deadheadMilesHundredths),
    rate: formatStatementDollars(load.rateCents),
  };
}

function presentEarning(line: StatementLine): PreparedPair {
  const rate = line.rateBp == null ? "" : ` (${bpToPercentString(line.rateBp)}%)`;
  return { label: `${line.label}${rate}`, value: formatStatementDollars(line.amountCents) };
}

function fleetRows(fleet: FleetStatement): PreparedPair[] {
  return [
    { label: "Units", value: String(fleet.unitCount) },
    { label: "Loads", value: String(fleet.loadCount) },
    { label: "Gross", value: formatStatementDollars(fleet.grossCents) },
    { label: "Driver pay", value: formatStatementDollars(fleet.driverPayCents) },
    { label: "Management fee", value: formatStatementDollars(fleet.managementFeeCents) },
    { label: "Tolson payable", value: formatStatementDollars(fleet.tolsonPayableCents) },
    { label: "Legacy retained", value: formatStatementDollars(fleet.legacyRetainedCents) },
    { label: "Dispatch fee", value: formatStatementDollars(fleet.dispatchFeeCents) },
    { label: "Factoring fee", value: formatStatementDollars(fleet.factoringFeeCents) },
    { label: "Discounted fuel", value: formatStatementDollars(fleet.fuelCents) },
    { label: "Tolls", value: formatStatementDollars(fleet.tollsCents) },
    { label: "Fixed expenses (owner)", value: formatStatementDollars(fleet.fixedOwnerCents) },
    { label: "Fixed expenses (management, not in net)", value: formatStatementDollars(fleet.fixedManagementCents) },
    { label: "Net to owner", value: formatStatementDollars(fleet.netCents) },
  ];
}

function requireLine(unit: UnitStatement, code: string, amount: number): void {
  const line = unit.lines.find((row) => row.lineCode === code);
  if (!line || line.amountCents !== amount) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} ${code} line does not match the statement.`);
  }
}

function requireFee(unit: UnitStatement, code: string, amount: number): void {
  const line = unit.lines.find((row) => row.lineCode === code);
  if (amount === 0 && !line) return;
  if (!line || line.amountCents !== amount) {
    throw new ReportBlockedError(`Unit ${unit.unitNumber} ${code} line does not match the statement.`);
  }
}

function sumCharged(unit: UnitStatement, chargedTo: "owner" | "management"): number {
  return sumLineAmounts(
    unit.lines.filter((line) => line.chargedTo === chargedTo && line.rateBp == null && line.lineCode !== "FUEL" && line.lineCode !== "TOLLS"),
    `unit ${unit.unitNumber} fixed`,
  );
}

function sumLineAmounts(lines: StatementLine[], label: string): number {
  let total = 0;
  for (const line of lines) {
    assertInteger(line.amountCents, label);
    total += line.amountCents;
  }
  return total;
}

function sumGallons(rows: ReportFuelRow[], product: ReportFuelRow["product"]): number {
  let total = 0;
  for (const row of rows) {
    if (row.product === product) total += row.gallonsMilli;
  }
  return total;
}
