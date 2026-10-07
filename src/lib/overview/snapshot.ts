import { assertInteger, assertNonNegativeInteger } from "@/lib/fee-engine/money";
import { expectedNetCents } from "@/lib/statements/engine";
import type { TruckClass } from "@/lib/fee-engine";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import type { UnitStatement } from "@/lib/statements/types";

const SHEET_FEE_LABELS = new Set([
  "driver compensation",
  "management fee",
  "dispatch fee",
  "factoring fee",
  "vektor fee",
]);
const SHEET_TOLL_LABELS = new Set(["toll pass", "toll fees", "toll charges"]);

/** One unit, or the fleet total, for the overview table. */
export type SnapshotRow = {
  unitNumber: string;
  truckClass: TruckClass | null;
  grossCents: number;
  feesCents: number;
  fuelCents: number;
  tollsCents: number;
  fixedCents: number;
  netCents: number;
};

export type WeekSnapshot = {
  units: SnapshotRow[];
  fleet: SnapshotRow;
};

/**
 * Fees deducted from owner net: driver, management (managed) or Tolson (owned),
 * dispatch, and factoring. Fixed expenses charged to management are not in this row.
 */
export function ownerFeeCents(unit: UnitStatement): number {
  assertNonNegativeInteger(unit.driverPayCents, "driver pay");
  assertNonNegativeInteger(unit.managementFeeCents, "management fee");
  assertNonNegativeInteger(unit.tolsonPayableCents, "Tolson payable");
  assertNonNegativeInteger(unit.dispatchFeeCents, "dispatch fee");
  assertNonNegativeInteger(unit.factoringFeeCents, "factoring fee");
  const managementOrTolson =
    unit.truckClass === "third_party" ? unit.managementFeeCents : unit.tolsonPayableCents;
  const fees =
    unit.driverPayCents + managementOrTolson + unit.dispatchFeeCents + unit.factoringFeeCents;
  assertNonNegativeInteger(fees, "fees");
  return fees;
}

/**
 * Dashboard week snapshot from the same sheet Ins and Outs as the cards.
 * Gross is Ins. Fees, fuel, tolls, and fixed split Outs. Net is Ins minus Outs.
 */
export function buildSheetWeekSnapshot(rows: TruckWeekInsOuts[]): WeekSnapshot {
  const units = rows.filter((row) => row.readable).map((row) => sheetSnapshotRow(row));
  const fleet = emptyFleet();
  for (const row of units) {
    fleet.grossCents += row.grossCents;
    fleet.feesCents += row.feesCents;
    fleet.fuelCents += row.fuelCents;
    fleet.tollsCents += row.tollsCents;
    fleet.fixedCents += row.fixedCents;
    fleet.netCents += row.netCents;
  }
  assertSnapshotMoney(fleet, "fleet");
  assertSnapshotIdentity(fleet, "fleet");
  return { units, fleet };
}

function sheetSnapshotRow(row: TruckWeekInsOuts): SnapshotRow {
  assertNonNegativeInteger(row.insCents, `gross ${row.unitNumber}`);
  assertNonNegativeInteger(row.outsCents, `outs ${row.unitNumber}`);
  let feesCents = 0;
  let fuelCents = 0;
  let tollsCents = 0;
  let fixedCents = 0;
  for (const category of row.categories) {
    assertNonNegativeInteger(category.cents, `${category.category} ${row.unitNumber}`);
    const key = category.category.trim().toLowerCase();
    if (SHEET_FEE_LABELS.has(key)) feesCents += category.cents;
    else if (key === "fuel") fuelCents += category.cents;
    else if (SHEET_TOLL_LABELS.has(key)) tollsCents += category.cents;
    else fixedCents += category.cents;
  }
  if (feesCents + fuelCents + tollsCents + fixedCents !== row.outsCents) {
    feesCents = row.outsCents;
    fuelCents = 0;
    tollsCents = 0;
    fixedCents = 0;
  }
  const snapshot: SnapshotRow = {
    unitNumber: row.unitNumber,
    truckClass: row.truckClass,
    grossCents: row.insCents,
    feesCents,
    fuelCents,
    tollsCents,
    fixedCents,
    netCents: row.insCents - row.outsCents,
  };
  assertSnapshotMoney(snapshot, row.unitNumber);
  assertSnapshotIdentity(snapshot, row.unitNumber);
  return snapshot;
}

export function buildWeekSnapshot(units: UnitStatement[]): WeekSnapshot {
  const rows = units.map((unit) => snapshotRow(unit));
  const fleet = emptyFleet();
  for (const row of rows) {
    fleet.grossCents += row.grossCents;
    fleet.feesCents += row.feesCents;
    fleet.fuelCents += row.fuelCents;
    fleet.tollsCents += row.tollsCents;
    fleet.fixedCents += row.fixedCents;
    fleet.netCents += row.netCents;
  }
  assertSnapshotMoney(fleet, "fleet");
  return { units: rows, fleet };
}

function snapshotRow(unit: UnitStatement): SnapshotRow {
  assertNonNegativeInteger(unit.grossCents, `gross ${unit.unitNumber}`);
  assertNonNegativeInteger(unit.fuelCents, `fuel ${unit.unitNumber}`);
  assertNonNegativeInteger(unit.tollsCents, `tolls ${unit.unitNumber}`);
  assertNonNegativeInteger(unit.fixedOwnerCents, `fixed ${unit.unitNumber}`);
  assertInteger(unit.netCents, `net ${unit.unitNumber}`);
  if (unit.truckClass !== "legacy_owned" && unit.truckClass !== "third_party") {
    throw new Error(`Unit ${unit.unitNumber} has an unknown truck class`);
  }
  const feesCents = ownerFeeCents(unit);
  if (unit.netCents !== expectedNetCents(unit)) {
    throw new Error(`Unit ${unit.unitNumber} net does not match gross minus owner deductions`);
  }
  const row: SnapshotRow = {
    unitNumber: unit.unitNumber,
    truckClass: unit.truckClass,
    grossCents: unit.grossCents,
    feesCents,
    fuelCents: unit.fuelCents,
    tollsCents: unit.tollsCents,
    fixedCents: unit.fixedOwnerCents,
    netCents: unit.netCents,
  };
  assertSnapshotIdentity(row, unit.unitNumber);
  return row;
}

function emptyFleet(): SnapshotRow {
  return {
    unitNumber: "Fleet",
    truckClass: null,
    grossCents: 0,
    feesCents: 0,
    fuelCents: 0,
    tollsCents: 0,
    fixedCents: 0,
    netCents: 0,
  };
}

function assertSnapshotMoney(row: SnapshotRow, label: string): void {
  assertNonNegativeInteger(row.grossCents, `${label} gross`);
  assertNonNegativeInteger(row.feesCents, `${label} fees`);
  assertNonNegativeInteger(row.fuelCents, `${label} fuel`);
  assertNonNegativeInteger(row.tollsCents, `${label} tolls`);
  assertNonNegativeInteger(row.fixedCents, `${label} fixed`);
  assertInteger(row.netCents, `${label} net`);
}

function assertSnapshotIdentity(row: SnapshotRow, label: string): void {
  const remainder = row.grossCents - row.feesCents - row.fuelCents - row.tollsCents - row.fixedCents;
  if (remainder !== row.netCents) {
    throw new Error(`Unit ${label} snapshot does not reconcile`);
  }
}
