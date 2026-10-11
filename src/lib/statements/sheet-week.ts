import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { expectedNetCents } from "@/lib/statements/engine";
import type { FleetStatement, UnitStatement, WeekStatements } from "@/lib/statements/types";

function cents(row: TruckWeekInsOuts, category: string): number {
  return row.categories.find((item) => item.category === category)?.cents ?? 0;
}

/** Replace a fee-engine unit with the shared sheet week when that sheet was read. */
export function applySheetWeek(unit: UnitStatement, row: TruckWeekInsOuts): UnitStatement {
  if (!row.readable || !row.outsFromWeekly) return unit;
  const driver = cents(row, "Driver compensation");
  const management = cents(row, "Management fee");
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
    tolsonPayableCents: third ? 0 : management,
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
  };
  next.netCents = expectedNetCents(next);
  return next;
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
