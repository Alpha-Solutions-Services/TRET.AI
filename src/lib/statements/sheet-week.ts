import { compareUnitNumbers } from "@/lib/fees/two-lines";
import { ownerPaysManagementTotal } from "@/lib/fees/kinds";
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
  const tarps = (row.weekLoads ?? [])
    .filter((load) => load.status === "Delivered")
    .reduce((sum, load) => sum + (load.tarpCents ?? 0), 0);
  const management = cents(row, "Management fee");
  const split = row.feeSplit ?? null;
  const legacy = split?.legacyFeeCents ?? 0;
  const tolsonPart = split?.tolsonFeeCents ?? 0;
  const dispatch = cents(row, "Dispatch fee");
  const factoring = cents(row, "Factoring fee");
  const fuel = cents(row, "Fuel");
  const tolls = cents(row, "Toll fees");
  const misc = row.miscCents ?? cents(row, "Misc");
  const named = driver + management + dispatch + factoring + fuel + tolls + misc;
  const fixed = row.outsCents - named;
  const paysTotal = ownerPaysManagementTotal(unit.truckClass);
  const fixedCents = fixed > 0 ? fixed : 0;
  const miscCents = misc > 0 ? misc : 0;
  const next: UnitStatement = {
    ...unit,
    grossCents: row.insCents,
    driverPayCents: driver,
    managementFeeCents: paysTotal ? management : 0,
    tolsonPayableCents: paysTotal ? tolsonPart : management,
    legacyRetainedCents: legacy,
    dispatchFeeCents: dispatch,
    factoringFeeCents: factoring,
    fuelCents: fuel,
    tollsCents: tolls,
    fixedOwnerCents: fixedCents,
    fixedManagementCents: 0,
    loadCount: row.loadCount,
    loadedMilesHundredths:
      row.truckMilesHundredths != null
        ? Math.max(0, row.truckMilesHundredths - (row.deadheadMilesHundredths ?? 0))
        : (row.loadedMilesHundredths ?? 0),
    deadheadMilesHundredths: row.deadheadMilesHundredths ?? 0,
    netCents: 0,
    lines: syncSheetLines(unit.lines, {
      driver,
      management: paysTotal ? management : 0,
      tolson: paysTotal ? tolsonPart : management,
      legacy,
      dispatch,
      factoring,
      fuel,
      tolls,
      fixed: fixedCents,
      misc: miscCents,
      chargeManagement: paysTotal,
      chargeTolson: !paysTotal,
    }),
  };
  next.netCents = expectedNetCents(next);
  if (tarps > 0) {
    const driverLine = next.lines.find((line) => line.lineCode === "DRIVER_PAY");
    if (driverLine) driverLine.label = "Driver pay (incl. tarps)";
  }
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
  misc: number;
  chargeManagement: boolean;
  chargeTolson: boolean;
};

/** Fee lines follow the sheet cells. Only the deducted fee is charged, so the total is not added twice. */
function syncSheetLines(existing: readonly StatementLine[], amounts: SheetLineAmounts): StatementLine[] {
  const lines = existing.map((line) => ({ ...line }));
  putLine(lines, "DRIVER_PAY", "Driver pay", amounts.driver, 10, true);
  putLine(lines, "MANAGEMENT_FEE", "Management fee", amounts.management, 20, amounts.chargeManagement, amounts.management > 0);
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
    "MISC",
  ]);
  for (const line of lines) {
    if (kept.has(line.lineCode)) continue;
    line.amountCents = 0;
    line.chargedTo = null;
    line.ownerVisible = false;
  }
  putLine(lines, "MISC", "Misc", amounts.misc, 70, amounts.misc > 0);
  putLine(lines, "SHEET_FIXED", "Fixed", amounts.fixed, 80, amounts.fixed > 0);
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
  visible = true,
): void {
  const line = lines.find((row) => row.lineCode === code);
  const next: StatementLine = {
    lineCode: code,
    label,
    amountCents: cents,
    rateBp: line?.rateBp ?? null,
    basePctBp: line?.basePctBp ?? null,
    chargedTo: charge && cents > 0 ? "owner" : null,
    ownerVisible: visible,
    sortOrder,
  };
  if (line) Object.assign(line, next);
  else lines.push(next);
}

export function overlaySheetStatements(
  statements: WeekStatements,
  rows: readonly TruckWeekInsOuts[],
): WeekStatements {
  const units = statements.units
    .map((unit) => {
      const row = rows.find((item) => unitKey(item.unitNumber) === unitKey(unit.unitNumber));
      return row ? applySheetWeek(unit, row) : unit;
    })
    .sort((a, b) => compareUnitNumbers(a.unitNumber, b.unitNumber));
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
