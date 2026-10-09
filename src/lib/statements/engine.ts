import {
  assertMonday,
  calculateFeeLines,
  findContractForDate,
  weekBoundsForDate,
  type FeeLineResult,
  type FeeRuleKind,
  type TruckClass,
} from "@/lib/fee-engine";
import { assertInteger, assertNonNegativeInteger } from "@/lib/fee-engine/money";
import { FIXED_EXPENSE_KINDS, FIXED_EXPENSE_LABELS } from "@/lib/fixed-expenses/kinds";
import { lookupWeeklyFixedExpense } from "@/lib/fixed-expenses/lookup";
import { validateUnlinkedFuelAtWeekClose, validateFuelRowCountDrop, validateTollRowCountDrop } from "@/lib/fuel-tolls/validate";
import type { FuelTollSettings } from "@/lib/fuel-tolls/types";
import { validateRowCountDrop } from "@/lib/vektor/validate";
import type {
  FleetStatement,
  StatementBlocker,
  StatementContract,
  StatementLine,
  StatementLoad,
  StatementTruck,
  UnitStatement,
  WeekStatementInput,
  WeekStatements,
} from "./types";

const FEE_LABELS: Record<FeeRuleKind, string> = {
  DRIVER_PAY: "Driver pay",
  MANAGEMENT_FEE: "Management fee",
  DISPATCH_FEE: "Dispatch fee",
  FACTORING_FEE: "Factoring fee",
  TOLSON_PAYABLE: "Tolson payable",
  LEGACY_RETAINED: "Legacy retained",
};

const FEE_SORT: Record<FeeRuleKind, number> = {
  DRIVER_PAY: 10,
  MANAGEMENT_FEE: 20,
  TOLSON_PAYABLE: 21,
  LEGACY_RETAINED: 22,
  DISPATCH_FEE: 30,
  FACTORING_FEE: 40,
};

/**
 * Owner net uses one half-up fee line on the week's gross.
 * Managed trucks deduct Management fee only. Tolson and Legacy retained are stored
 * and are not deducted again. Legacy-owned trucks deduct Tolson payable.
 * Fixed expenses charged to management are stored and are not deducted.
 */
export function ownerDeductionCents(unit: UnitStatement): number {
  const managementOrTolson =
    unit.truckClass === "third_party" ? unit.managementFeeCents : unit.tolsonPayableCents;
  return (
    unit.driverPayCents +
    managementOrTolson +
    unit.dispatchFeeCents +
    unit.factoringFeeCents +
    unit.fuelCents +
    unit.tollsCents +
    unit.fixedOwnerCents
  );
}

export function expectedNetCents(unit: UnitStatement): number {
  return unit.grossCents - ownerDeductionCents(unit);
}

export function buildWeekStatements(input: WeekStatementInput): WeekStatements {
  assertMonday(input.weekStart, "Week start");
  const bounds = weekBoundsForDate(input.weekStart);
  if (bounds.start !== input.weekStart) {
    throw new Error("Week start must be a Monday");
  }
  assertDropPct(input.rowCountDropPct.loads, "loads row-count drop");
  assertDropPct(input.rowCountDropPct.fuel, "fuel row-count drop");
  assertDropPct(input.rowCountDropPct.tolls, "tolls row-count drop");

  const blockers: StatementBlocker[] = [];
  const weekLoads: StatementLoad[] = [];

  for (const load of input.loads) {
    assertNonNegativeInteger(load.grossCents, `load ${load.id} gross`);
    assertNonNegativeInteger(load.loadedMilesHundredths, `load ${load.id} loaded miles`);
    assertNonNegativeInteger(load.deadheadMilesHundredths, `load ${load.id} deadhead`);
    const deliveryWeek = weekBoundsForDate(load.deliveryDate).start;
    const inWeek = deliveryWeek === input.weekStart;
    const storedSaysWeek = load.storedWeekStart === input.weekStart;
    if (!inWeek && !storedSaysWeek) continue;
    if (load.storedWeekStart && load.storedWeekStart !== deliveryWeek) {
      blockers.push({
        rule: "delivery_week_mismatch",
        message: `Load ${load.id} delivery ${load.deliveryDate} is week ${deliveryWeek}, but the stored week is ${load.storedWeekStart}.`,
        ref: load.id,
      });
      continue;
    }
    if (!inWeek) continue;
    if (!load.truckId || !load.unitNumber) {
      blockers.push({
        rule: "load_missing_truck",
        message: `Load ${load.id} delivered ${load.deliveryDate} has no truck.`,
        ref: load.id,
      });
      continue;
    }
    weekLoads.push(load);
  }

  for (const row of input.fuel) {
    assertNonNegativeInteger(row.amountCents, "fuel amount");
  }
  for (const row of input.tolls) {
    assertNonNegativeInteger(row.amountCents, "toll amount");
  }

  const loadUnits = new Set(weekLoads.map((load) => load.unitNumber).filter((unit): unit is string => !!unit));
  for (const issue of validateUnlinkedFuelAtWeekClose(input.fuel, loadUnits, input.weekStart)) {
    blockers.push({
      rule: issue.rule,
      message: issue.message,
      ref: issue.ref ?? null,
    });
  }
  blockers.push(...rowCountBlockers(input));

  const units: UnitStatement[] = [];
  const trucks = [...input.trucks].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
  const seen = new Set<string>();
  for (const truck of trucks) {
    if (seen.has(truck.id)) {
      blockers.push({
        rule: "duplicate_truck",
        message: `Truck ${truck.unitNumber} is listed twice.`,
        ref: truck.id,
      });
      continue;
    }
    seen.add(truck.id);
    const built = buildUnit(truck, input, weekLoads, blockers);
    if (built) units.push(built);
  }

  const fleet = sumFleet(units);
  if (units.length === 0 && blockers.length === 0) {
    blockers.push({
      rule: "nothing_to_close",
      message: `Week ${input.weekStart} has no loads, fuel, tolls, or fixed expenses to close.`,
      ref: input.weekStart,
    });
  }

  for (const unit of units) {
    if (unit.netCents !== expectedNetCents(unit)) {
      blockers.push({
        rule: "statement_does_not_reconcile",
        message: `Unit ${unit.unitNumber} net does not match gross minus owner deductions.`,
        ref: unit.unitNumber,
      });
    }
  }

  return {
    weekStart: bounds.start,
    weekEnd: bounds.end,
    units,
    fleet,
    blockers,
    closeAllowed: blockers.length === 0,
  };
}

export function lockPayload(result: WeekStatements): {
  weekEnd: string;
  fleet: FleetStatement;
  statements: UnitStatement[];
} {
  if (!result.closeAllowed) {
    throw new Error("This week has blockers and cannot be locked");
  }
  for (const unit of result.units) {
    assertUnitMoney(unit);
  }
  assertFleetMoney(result.fleet);
  return {
    weekEnd: result.weekEnd,
    fleet: result.fleet,
    statements: result.units,
  };
}

function assertUnitMoney(unit: UnitStatement): void {
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
  if (unit.netCents !== expectedNetCents(unit)) {
    throw new Error(`Unit ${unit.unitNumber} net does not reconcile`);
  }
}

function assertFleetMoney(fleet: FleetStatement): void {
  assertInteger(fleet.netCents, "fleet net");
  assertNonNegativeInteger(fleet.grossCents, "fleet gross");
  assertNonNegativeInteger(fleet.fuelCents, "fleet fuel");
  assertNonNegativeInteger(fleet.tollsCents, "fleet tolls");
}

function assertDropPct(value: number, label: string): void {
  assertInteger(value, label);
  if (value < 0 || value > 100) {
    throw new Error(`${label} must be from 0 to 100`);
  }
}

function rowCountBlockers(input: WeekStatementInput): StatementBlocker[] {
  const weekEnd = weekBoundsForDate(input.weekStart).end;
  const blockers: StatementBlocker[] = [];
  const kinds = ["loads", "fuel", "tolls"] as const;
  for (const kind of kinds) {
    const overlapping = input.importRuns
      .filter(
        (run) =>
          run.kind === kind &&
          (run.status === "success" || run.status === "blocked") &&
          rangesOverlap(run.rangeFrom, run.rangeTo, input.weekStart, weekEnd),
      )
      .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
    if (overlapping.length === 0) continue;
    const latest = overlapping[overlapping.length - 1]!;
    let previous: number | null = null;
    for (let i = overlapping.length - 2; i >= 0; i -= 1) {
      const run = overlapping[i]!;
      if (run.status === "success") {
        previous = run.rowsFetched;
        break;
      }
    }
    const pct =
      kind === "loads"
        ? input.rowCountDropPct.loads
        : kind === "fuel"
          ? input.rowCountDropPct.fuel
          : input.rowCountDropPct.tolls;
    const issue =
      kind === "loads"
        ? validateRowCountDrop(latest.rowsFetched, previous, { rowCountDropBlockPct: pct })
        : kind === "fuel"
          ? validateFuelRowCountDrop(latest.rowsFetched, previous, dropSettings(pct))
          : validateTollRowCountDrop(latest.rowsFetched, previous, dropSettings(pct));
    if (issue) {
      blockers.push({
        rule: "row_count_drop",
        message: `${kind}: ${issue.message}`,
        ref: input.weekStart,
      });
    }
  }
  return blockers;
}

function dropSettings(pct: number): FuelTollSettings {
  return {
    priceMinTenthCents: 0,
    priceMaxTenthCents: 0,
    dieselTankGallonsMilli: 0,
    defTankGallonsMilli: 0,
    mpgMinMilli: 0,
    mpgMaxMilli: 0,
    rowCountDropBlockPct: pct,
  };
}

function rangesOverlap(from: string, to: string, weekStart: string, weekEnd: string): boolean {
  return from <= weekEnd && weekStart <= to;
}

function buildUnit(
  truck: StatementTruck,
  input: WeekStatementInput,
  weekLoads: StatementLoad[],
  blockers: StatementBlocker[],
): UnitStatement | null {
  const loads = weekLoads.filter((load) => load.truckId === truck.id);
  const fuelCents = sumMatching(input.fuel, truck.unitNumber, input.weekStart);
  const tollsCents = sumMatching(input.tolls, truck.unitNumber, input.weekStart);
  const grossCents = sumNumbers(loads.map((load) => load.grossCents), "gross");
  const loadedMilesHundredths = sumNumbers(
    loads.map((load) => load.loadedMilesHundredths),
    "loaded miles",
  );
  const deadheadMilesHundredths = sumNumbers(
    loads.map((load) => load.deadheadMilesHundredths),
    "deadhead",
  );

  const fixedLines: StatementLine[] = [];
  let fixedOwnerCents = 0;
  let fixedManagementCents = 0;
  for (const kind of FIXED_EXPENSE_KINDS) {
    let resolved: { amountCents: number; chargedTo: "owner" | "management" };
    try {
      resolved = lookupWeeklyFixedExpense({
        versions: input.fixedVersions,
        overrides: input.fixedOverrides,
        truckId: truck.id,
        kind,
        weekStart: input.weekStart,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fixed expense lookup failed";
      if (message.startsWith("No fixed expense")) {
        continue;
      }
      blockers.push({
        rule: "fixed_expense_overlap",
        message: `Truck ${truck.unitNumber}: ${message}`,
        ref: truck.unitNumber,
      });
      return null;
    }
    if (resolved.amountCents === 0) continue;
    if (resolved.chargedTo === "management") fixedManagementCents += resolved.amountCents;
    else fixedOwnerCents += resolved.amountCents;
    fixedLines.push({
      lineCode: kind,
      label: FIXED_EXPENSE_LABELS[kind],
      amountCents: resolved.amountCents,
      rateBp: null,
      basePctBp: null,
      chargedTo: resolved.chargedTo,
      ownerVisible: true,
      sortOrder: 70 + FIXED_EXPENSE_KINDS.indexOf(kind),
    });
  }

  const hasActivity =
    loads.length > 0 || fuelCents > 0 || tollsCents > 0 || fixedOwnerCents > 0 || fixedManagementCents > 0;
  if (!hasActivity) return null;

  let feeLines: FeeLineResult[] = [];
  let contractId: string | null = null;
  if (loads.length > 0 || grossCents > 0) {
    const stored = input.contracts.filter((contract) => contract.truckId === truck.id);
    const covering = stored.filter((contract) => contractCovers(contract, input.weekStart));
    const fallback = covering.length === 0 ? defaultContract(truck) : null;
    const truckContracts = covering.length > 0 ? stored : fallback ? [fallback] : [];
    if (truckContracts.length === 0) {
      blockers.push({
        rule: "missing_fee_contract",
        message: `Truck ${truck.unitNumber} has no fee setup. Open the truck and set Tolson payable or the management fee.`,
        ref: truck.id,
      });
      return null;
    }
    try {
      const contract = findContractForDate(toContractRecords(truckContracts), input.weekStart);
      const full = truckContracts.find((row) => row.id === contract.id);
      if (!full) throw new Error(`No fee contract covers date ${input.weekStart}`);
      for (const load of loads) {
        const day = findContractForDate(toContractRecords(truckContracts), load.deliveryDate);
        if (day.id !== contract.id) {
          throw new Error(
            `Rates change inside week ${input.weekStart} (contracts ${contract.id} and ${day.id})`,
          );
        }
      }
      feeLines = calculateFeeLines({
        grossCents,
        truckClass: truck.truckClass,
        rules: full.rules,
      });
      contractId = contract.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fee contract error";
      blockers.push({
        rule: message.startsWith("No fee contract") ? "missing_fee_contract" : "fee_contract_error",
        message: `Truck ${truck.unitNumber}: ${message}`,
        ref: truck.unitNumber,
      });
      return null;
    }
  }

  const driverPayCents = feeAmount(feeLines, "DRIVER_PAY");
  const managementFeeCents = feeAmount(feeLines, "MANAGEMENT_FEE");
  const tolsonPayableCents = feeAmount(feeLines, "TOLSON_PAYABLE");
  const legacyRetainedCents = feeAmount(feeLines, "LEGACY_RETAINED");
  const dispatchFeeCents = feeAmount(feeLines, "DISPATCH_FEE");
  const factoringFeeCents = feeAmount(feeLines, "FACTORING_FEE");

  if (truck.truckClass === "legacy_owned" && grossCents > 0 && !feeLines.some((line) => line.kind === "TOLSON_PAYABLE")) {
    blockers.push({
      rule: "missing_tolson_payable",
      message: `Truck ${truck.unitNumber} is Legacy-owned and the contract has no Tolson payable rule.`,
      ref: truck.unitNumber,
    });
    return null;
  }

  const lines: StatementLine[] = [];
  for (const line of feeLines) {
    const ownerVisible = ownerSeesFee(truck.truckClass, line.kind);
    lines.push({
      lineCode: line.kind,
      label: FEE_LABELS[line.kind],
      amountCents: line.amountCents,
      rateBp: line.rateBp,
      basePctBp: line.basePctBp,
      chargedTo: ownerVisible ? "owner" : null,
      ownerVisible,
      sortOrder: FEE_SORT[line.kind],
    });
  }
  lines.push(expenseLine("FUEL", "Fuel", fuelCents, 50));
  lines.push(expenseLine("TOLLS", "Tolls", tollsCents, 60));
  lines.push(...fixedLines);
  lines.sort((a, b) => a.sortOrder - b.sortOrder);

  const unit: UnitStatement = {
    truckId: truck.id,
    unitNumber: truck.unitNumber,
    truckClass: truck.truckClass,
    contractId,
    grossCents,
    driverPayCents,
    managementFeeCents,
    tolsonPayableCents,
    legacyRetainedCents,
    dispatchFeeCents,
    factoringFeeCents,
    fuelCents,
    tollsCents,
    fixedOwnerCents,
    fixedManagementCents,
    netCents: 0,
    loadCount: loads.length,
    loadedMilesHundredths,
    deadheadMilesHundredths,
    lines,
  };
  unit.netCents = expectedNetCents(unit);
  assertInteger(unit.netCents, `net for ${truck.unitNumber}`);
  return unit;
}

function ownerSeesFee(truckClass: TruckClass, kind: FeeRuleKind): boolean {
  if (kind === "LEGACY_RETAINED") return false;
  if (kind === "TOLSON_PAYABLE") return truckClass === "legacy_owned";
  if (kind === "MANAGEMENT_FEE") return truckClass === "third_party";
  return true;
}

function expenseLine(code: string, label: string, amountCents: number, sortOrder: number): StatementLine {
  return {
    lineCode: code,
    label,
    amountCents,
    rateBp: null,
    basePctBp: null,
    chargedTo: "owner",
    ownerVisible: true,
    sortOrder,
  };
}

function feeAmount(lines: FeeLineResult[], kind: FeeRuleKind): number {
  return lines.find((line) => line.kind === kind)?.amountCents ?? 0;
}

function contractCovers(contract: StatementContract, date: string): boolean {
  if (contract.effectiveFrom > date) return false;
  if (contract.effectiveTo !== null && contract.effectiveTo < date) return false;
  return true;
}

/** 10 percent Tolson on a Legacy truck. 15 percent management on a managed truck, split 10 and 5. */
function defaultContract(truck: StatementTruck): StatementContract | null {
  const tolson = truck.tolsonRateBp != null && truck.tolsonRateBp >= 0 ? truck.tolsonRateBp : 1000;
  if (truck.truckClass === "legacy_owned") {
    return {
      id: `default:${truck.id}`,
      truckId: truck.id,
      effectiveFrom: "2000-01-01",
      effectiveTo: null,
      rules: [{ kind: "TOLSON_PAYABLE", rateBp: tolson, basePctBp: 10000 }],
    };
  }
  if (truck.truckClass === "third_party") {
    const management = Math.max(1500, tolson);
    const legacy = management - tolson;
    return {
      id: `default:${truck.id}`,
      truckId: truck.id,
      effectiveFrom: "2000-01-01",
      effectiveTo: null,
      rules: [
        { kind: "MANAGEMENT_FEE", rateBp: management, basePctBp: 10000 },
        { kind: "TOLSON_PAYABLE", rateBp: tolson, basePctBp: 10000 },
        { kind: "LEGACY_RETAINED", rateBp: legacy, basePctBp: 10000 },
      ],
    };
  }
  return null;
}

function toContractRecords(contracts: StatementContract[]) {
  return contracts.map((contract) => ({
    id: contract.id,
    truckId: contract.truckId,
    effectiveFrom: contract.effectiveFrom,
    effectiveTo: contract.effectiveTo,
  }));
}

function sumMatching(
  rows: Array<{ unitNumber: string | null; weekStart: string | null; amountCents: number }>,
  unitNumber: string,
  weekStart: string,
): number {
  return sumNumbers(
    rows
      .filter((row) => row.unitNumber === unitNumber && row.weekStart === weekStart)
      .map((row) => row.amountCents),
    "amount",
  );
}

function sumNumbers(values: number[], label: string): number {
  let total = 0;
  for (const value of values) {
    assertInteger(value, label);
    total += value;
  }
  if (!Number.isInteger(total)) {
    throw new Error(`${label} sum is not an integer`);
  }
  return total;
}

function sumFleet(units: UnitStatement[]): FleetStatement {
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
