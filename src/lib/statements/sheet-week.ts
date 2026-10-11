import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { expectedNetCents } from "@/lib/statements/engine";
import type { FleetStatement, StatementLine, UnitStatement, WeekStatements } from "@/lib/statements/types";

function cents(row: TruckWeekInsOuts, category: string): number {
  return row.categories.find((item) => item.category === category)?.cents ?? 0;
}

/** Replace a fee-engine unit with the shared sheet week when that sheet was read. */
export function applySheetWeek(unit: UnitStatement, row: TruckWeekInsOuts): UnitStatement {
  if (!row.readable || !row.outsFromWeekly) return unit;
  const driver = cents(row, "Driver compensation");
  const management = row.managementFeeCents ?? cents(row, "Management fee");
  const legacy = row.legacyFeeCents ?? 0;
  const tolson = row.tolsonLeaseFeeCents ?? 0;
  const dispatch = cents(row, "Dispatch fee");
  const factoring = cents(row, "Factoring fee");
  const fuel = cents(row, "Fuel");
  const tolls = cents(row, "Toll fees");
  const named = driver + management + dispatch + factoring + fuel + tolls;
  const fixed = row.outsCents - named;
  const third = unit.truckClass === "third_party";
  const next: UnitStatement = {
    ...unit,
    grossCents: row.insCents,
    driverPayCents: driver,
    managementFeeCents: third ? management : 0,
    tolsonPayableCents: third ? tolson : management,
    legacyRetainedCents: legacy,
    dispatchFeeCents: dispatch,
    factoringFeeCents: factoring,
    fuelCents: fuel,
    tollsCents: tolls,
    fixedOwnerCents: fixed > 0 ? fixed : 0,
    fixedManagementCents: 0,
    loadCount: row.loadCount,
    loadedMilesHundredths: row.truckMilesHundredths ?? row.loadedMilesHundredths ?? 0,
    deadheadMilesHundredths: row.truckMilesHundredths != null ? 0 : (row.deadheadMilesHundredths ?? 0),
    netCents: 0,
    lines: syncSheetLines(unit.lines, {
      driver,
      management: third ? management : 0,
      tolson: third ? tolson : management,
      legacy,
      dispatch,
      factoring,
      fuel,
      tolls,
      fixed: fixed > 0 ? fixed : 0,
      chargeManagement: third,
      chargeTolson: !third,
    }),
  };
  next.netCents = expectedNetCents(next);
  return next;
}

type SheetLineAmounts = {
  driver: number;
  management: number;
  tolson: number;
  legacy: number;
  dispatch: number;
  factoring: number;
  fuel: number;
  tolls: number;
  fixed: number;
  chargeManagement: boolean;
  chargeTolson: boolean;
};

/** Fee lines follow the sheet cells. Only the deducted fee is charged, so the total is not added twice. */
function syncSheetLines(existing: readonly StatementLine[], amounts: SheetLineAmounts): StatementLine[] {
  const lines = existing.map((line) => ({ ...line }));
  putLine(lines, "DRIVER_PAY", "Driver pay", amounts.driver, 10, true);
  putLine(lines, "MANAGEMENT_FEE", "Management fee", amounts.management, 20, amounts.chargeManagement);
  putLine(lines, "TOLSON_PAYABLE", "Tolson lease fee", amounts.tolson, 21, amounts.chargeTolson);
  putLine(lines, "LEGACY_RETAINED", "Legacy fee", amounts.legacy, 22, false);
  putLine(lines, "DISPATCH_FEE", "Dispatch fee", amounts.dispatch, 30, true);
  putLine(lines, "FACTORING_FEE", "Factoring fee", amounts.factoring, 40, true);
  putLine(lines, "FUEL", "Fuel", amounts.fuel, 50, true);
  putLine(lines, "TOLLS", "Tolls", amounts.tolls, 60, true);
  const kept = new Set([
    "DRIVER_PAY",
    "MANAGEMENT_FEE",
    "TOLSON_PAYABLE",
    "LEGACY_RETAINED",
    "DISPATCH_FEE",
    "FACTORING_FEE",
    "FUEL",
    "TOLLS",
    "SHEET_FIXED",
  ]);
  for (const line of lines) {
    if (kept.has(line.lineCode)) continue;
    line.amountCents = 0;
    line.chargedTo = null;
    line.ownerVisible = false;
  }
  putLine(lines, "SHEET_FIXED", "Fixed and misc", amounts.fixed, 80, true);
  lines.sort((a, b) => a.sortOrder - b.sortOrder);
  return lines;
}

function putLine(
  lines: StatementLine[],
  code: string,
  label: string,
  cents: number,
  sortOrder: number,
  charge: boolean,
): void {
  const line = lines.find((row) => row.lineCode === code);
  const next: StatementLine = {
    lineCode: code,
    label,
    amountCents: cents,
    rateBp: line?.rateBp ?? null,
    basePctBp: line?.basePctBp ?? null,
    chargedTo: charge && cents > 0 ? "owner" : null,
    ownerVisible: true,
    sortOrder,
  };
  if (line) Object.assign(line, next);
  else lines.push(next);
}

export function overlaySheetStatements(
  statements: WeekStatements,
  rows: readonly TruckWeekInsOuts[],
): WeekStatements {
  const units = statements.units.map((unit) => {
    const row = rows.find((item) => unitKey(item.unitNumber) === unitKey(unit.unitNumber));
    return row ? applySheetWeek(unit, row) : unit;
  });
  return { ...statements, units, fleet: fleetFromUnits(units) };
}

function unitKey(unitNumber: string): string {
  return unitNumber.replace(/\D/g, "").replace(/^0+/, "") || unitNumber.trim();
}

function fleetFromUnits(units: readonly UnitStatement[]): FleetStatement {
  const fleet: FleetStatement = {
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
    unitCount: units.length,
  };
  for (const unit of units) {
    fleet.grossCents += unit.grossCents;
    fleet.driverPayCents += unit.driverPayCents;
    fleet.managementFeeCents += unit.managementFeeCents;
    fleet.tolsonPayableCents += unit.tolsonPayableCents;
    fleet.legacyRetainedCents += unit.legacyRetainedCents;
    fleet.dispatchFeeCents += unit.dispatchFeeCents;
    fleet.factoringFeeCents += unit.factoringFeeCents;
    fleet.fuelCents += unit.fuelCents;
    fleet.tollsCents += unit.tollsCents;
    fleet.fixedOwnerCents += unit.fixedOwnerCents;
    fleet.fixedManagementCents += unit.fixedManagementCents;
    fleet.netCents += unit.netCents;
    fleet.loadCount += unit.loadCount;
  }
  return fleet;
}
