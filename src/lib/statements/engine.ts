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
import { ownerPaysManagementTotal } from "@/lib/fees/kinds";
import { bpToPercentString } from "@/lib/fees/percent";
import { compareUnitNumbers, managementFeeSplit, seededFeeRates } from "@/lib/fees/two-lines";
import { FIXED_EXPENSE_KINDS, FIXED_EXPENSE_LABELS } from "@/lib/fixed-expenses/kinds";
import { lookupWeeklyFixedExpense } from "@/lib/fixed-expenses/lookup";
import { validateUnlinkedFuelAtWeekClose } from "@/lib/fuel-tolls/validate";
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
  TOLSON_PAYABLE: "Tolson lease fee",
  LEGACY_RETAINED: "Legacy fee",
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
 * Misc is its own owner line. Fixed is the remaining fixed amount.
 * Fixed expenses charged to management are stored and are not deducted.
 */
export function miscOwnerCents(unit: Pick<UnitStatement, "lines">): number {
  let total = 0;
  for (const line of unit.lines) {
    if (line.lineCode !== "MISC" || line.chargedTo !== "owner") continue;
    total += line.amountCents;
  }
  return total;
}

export function ownerDeductionCents(unit: UnitStatement): number {
  const managementOrTolson = ownerPaysManagementTotal(unit.truckClass)
    ? unit.managementFeeCents
    : unit.tolsonPayableCents;
  return (
    unit.driverPayCents +
    managementOrTolson +
    unit.dispatchFeeCents +
    unit.factoringFeeCents +
    unit.fuelCents +
    unit.tollsCents +
    miscOwnerCents(unit) +
    unit.fixedOwnerCents
  );
}

/**
 * Tarps are part of driver pay and are never a separate owner deduction.
 * Sheet driver pay already includes them, so this is only for a driver-pay line
 * TRET computed from the rate. No driver-pay line, as on the percent-fee path, charges nothing.
 */
function includeTarpInDriverPay(unit: UnitStatement, tarpCents: number): UnitStatement {
  const tarp = tarpCents > 0 ? tarpCents : 0;
  if (tarp === 0) return unit;
  const driver = unit.lines.find((line) => line.lineCode === "DRIVER_PAY");
  if (!driver || driver.rateBp == null) return unit;
  const lines = unit.lines.map((line) => {
    if (line.lineCode !== "DRIVER_PAY") return line;
    return {
      ...line,
      label: `Driver pay (${bpToPercentString(line.rateBp ?? 0)}% + tarps)`,
      amountCents: line.amountCents + tarp,
      chargedTo: "owner" as const,
      ownerVisible: true,
    };
  });
  const next: UnitStatement = { ...unit, driverPayCents: unit.driverPayCents + tarp, lines };
  next.netCents = expectedNetCents(next);
  return next;
}

export function expectedNetCents(unit: UnitStatement): number {
  return unit.grossCents - ownerDeductionCents(unit);
}

/** Owner-charged lines. Legacy retained and the internal split are not in this sum. */
export function ownerChargedLineCents(unit: Pick<UnitStatement, "lines">): number {
  let total = 0;
  for (const line of unit.lines) {
    if (line.chargedTo !== "owner") continue;
    total += line.amountCents;
  }
  return total;
}

/** Gross minus the owner-charged lines equals net. */
export function linesMatchNet(unit: Pick<UnitStatement, "lines" | "grossCents" | "netCents">): boolean {
  return unit.grossCents - ownerChargedLineCents(unit) === unit.netCents;
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
    if (deliveryWeek !== input.weekStart) continue;
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
    assertInteger(row.amountCents, "toll amount");
  }

  const loadUnits = new Set(weekLoads.map((load) => load.unitNumber).filter((unit): unit is string => !!unit));
  for (const issue of validateUnlinkedFuelAtWeekClose(input.fuel, loadUnits, input.weekStart)) {
    blockers.push({
      rule: issue.rule,
      message: issue.message,
      ref: issue.ref ?? null,
    });
  }
  const warnings = rowCountWarnings(input);

  const units: UnitStatement[] = [];
  const trucks = [...input.trucks].sort((a, b) => compareUnitNumbers(a.unitNumber, b.unitNumber));
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
    if (!linesMatchNet(unit)) {
      blockers.push({
        rule: "statement_does_not_reconcile",
        message: `Unit ${unit.unitNumber} net does not match the statement lines.`,
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
    warnings,
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
  assertInteger(unit.tollsCents, "tolls");
  assertNonNegativeInteger(unit.fixedOwnerCents, "fixed owner");
  assertNonNegativeInteger(unit.fixedManagementCents, "fixed management");
  assertInteger(unit.netCents, "net");
  if (!linesMatchNet(unit)) {
    throw new Error(`Unit ${unit.unitNumber} net does not match the statement lines`);
  }
}

function assertFleetMoney(fleet: FleetStatement): void {
  assertInteger(fleet.netCents, "fleet net");
  assertNonNegativeInteger(fleet.grossCents, "fleet gross");
  assertNonNegativeInteger(fleet.fuelCents, "fleet fuel");
  assertInteger(fleet.tollsCents, "fleet tolls");
}

function assertDropPct(value: number, label: string): void {
  assertInteger(value, label);
  if (value < 0 || value > 100) {
    throw new Error(`${label} must be from 0 to 100`);
  }
}

function coversFullWeek(rangeFrom: string, rangeTo: string, weekStart: string, weekEnd: string): boolean {
  return rangeFrom <= weekStart && rangeTo >= weekEnd;
}

function rangeSpanDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** A short daily file is normal. A full Monday–Sunday import can warn. A later run with a narrower date range than the previous run does not. The warning does not block close or the PDF. */
function rowCountWarnings(input: WeekStatementInput): StatementBlocker[] {
  const weekEnd = weekBoundsForDate(input.weekStart).end;
  const warnings: StatementBlocker[] = [];
  const kinds = ["loads", "fuel", "tolls"] as const;
  for (const kind of kinds) {
    if (input.acknowledgedDrops?.includes(kind)) continue;
    const overlapping = input.importRuns
      .filter(
        (run) =>
          run.kind === kind &&
          (run.status === "success" || run.status === "blocked") &&
          coversFullWeek(run.rangeFrom, run.rangeTo, input.weekStart, weekEnd),
      )
      .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
    if (overlapping.length === 0) continue;
    const latest = overlapping[overlapping.length - 1]!;
    let previousRun: (typeof overlapping)[number] | null = null;
    for (let i = overlapping.length - 2; i >= 0; i -= 1) {
      const run = overlapping[i]!;
      if (run.status === "success") {
        previousRun = run;
        break;
      }
    }
    if (
      previousRun &&
      rangeSpanDays(latest.rangeFrom, latest.rangeTo) < rangeSpanDays(previousRun.rangeFrom, previousRun.rangeTo)
    ) {
      continue;
    }
    const previous = previousRun?.rowsFetched ?? null;
    const pct =
      kind === "loads"
        ? input.rowCountDropPct.loads
        : kind === "fuel"
          ? input.rowCountDropPct.fuel
          : input.rowCountDropPct.tolls;
    const noun = kind === "loads" ? "rows" : kind === "fuel" ? "fuel rows" : "toll rows";
    const message = rowCountDrop(latest.rowsFetched, previous, pct, noun);
    if (message) {
      warnings.push({
        rule: "row_count_drop",
        message: `${kind}: ${message}`,
        ref: input.weekStart,
      });
    }
  }
  return warnings;
}

/** One row-count check. The noun keeps the fuel and toll warning text. */
function rowCountDrop(fetched: number, previousFetched: number | null, pct: number, noun: string): string | null {
  if (previousFetched == null || previousFetched <= 0) return null;
  const minAllowed = Math.ceil((previousFetched * (100 - pct)) / 100);
  if (fetched < minAllowed) {
    return `Fetched ${fetched} ${noun}; previous run had ${previousFetched}. Drop exceeds ${pct}% threshold.`;
  }
  return null;
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

  const miscCents = (input.misc ?? [])
    .filter((row) => row.unitNumber === truck.unitNumber)
    .reduce((sum, row) => sum + row.amountCents, 0);
  if (miscCents > 0) {
    fixedLines.push({
      lineCode: "MISC",
      label: "Misc",
      amountCents: miscCents,
      rateBp: null,
      basePctBp: null,
      chargedTo: "owner",
      ownerVisible: true,
      sortOrder: 90,
    });
  }

  const hasActivity =
    loads.length > 0 ||
    fuelCents > 0 ||
    tollsCents > 0 ||
    fixedOwnerCents > 0 ||
    fixedManagementCents > 0 ||
    miscCents > 0;
  if (!hasActivity) {
    if (!truck.active) return null;
    const lines: StatementLine[] = [expenseLine("FUEL", "Fuel", 0, 50), expenseLine("TOLLS", "Tolls", 0, 60)];
    ensureUnsetLine(lines, "TOLSON_PAYABLE");
    ensureUnsetLine(lines, "LEGACY_RETAINED");
    lines.sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      truckId: truck.id,
      unitNumber: truck.unitNumber,
      truckClass: truck.truckClass,
      contractId: null,
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
      loadedMilesHundredths: 0,
      deadheadMilesHundredths: 0,
      lines,
    };
  }

  const resolved = resolveFees(truck, input, grossCents, loads);
  if (!resolved.ok) {
    blockers.push(resolved.blocker);
    return null;
  }
  const fees = resolved.fees;
  const lines = [...fees.lines];
  ensureUnsetLine(lines, "TOLSON_PAYABLE");
  ensureUnsetLine(lines, "LEGACY_RETAINED");
  lines.push(expenseLine("FUEL", "Fuel", fuelCents, 50));
  lines.push(expenseLine("TOLLS", "Tolls", tollsCents, 60));
  lines.push(...fixedLines);
  lines.sort((a, b) => a.sortOrder - b.sortOrder);

  const unit: UnitStatement = {
    truckId: truck.id,
    unitNumber: truck.unitNumber,
    truckClass: fees.truckClass,
    contractId: fees.contractId,
    grossCents,
    driverPayCents: fees.driverPayCents,
    managementFeeCents: fees.managementFeeCents,
    tolsonPayableCents: fees.tolsonPayableCents,
    legacyRetainedCents: fees.legacyRetainedCents,
    dispatchFeeCents: fees.dispatchFeeCents,
    factoringFeeCents: fees.factoringFeeCents,
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
  const tarp = loads.reduce((sum, load) => sum + (load.tarpCents ?? 0), 0);
  return includeTarpInDriverPay(unit, tarp);
}

type ResolvedFees = {
  contractId: string | null;
  truckClass: TruckClass;
  driverPayCents: number;
  managementFeeCents: number;
  tolsonPayableCents: number;
  legacyRetainedCents: number;
  dispatchFeeCents: number;
  factoringFeeCents: number;
  lines: StatementLine[];
};

/**
 * One fee for the week.
 * A stored contract is the source, and an active fixed weekly amount replaces that kind.
 * With no stored contract, the source is the truck's two basis-point lines, or the seeded pair.
 * A fixed weekly amount is not applied on that path. Whether it should win is open.
 */
function resolveFees(
  truck: StatementTruck,
  input: WeekStatementInput,
  grossCents: number,
  loads: StatementLoad[],
): { ok: true; fees: ResolvedFees } | { ok: false; blocker: StatementBlocker } {
  if (!(loads.length > 0 || grossCents > 0)) {
    return { ok: true, fees: emptyFees(truck.truckClass) };
  }
  const stored = input.contracts.filter((contract) => contract.truckId === truck.id);
  const covering = stored.filter((contract) => contractCovers(contract, input.weekStart));
  if (covering.length > 0) {
    try {
      return { ok: true, fees: feesFromContract(truck, input.weekStart, stored, grossCents, loads) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fee contract error";
      return {
        ok: false,
        blocker: {
          rule: message.startsWith("No fee contract") ? "missing_fee_contract" : "fee_contract_error",
          message: `Truck ${truck.unitNumber}: ${message}`,
          ref: truck.unitNumber,
        },
      };
    }
  }
  if (truck.truckClass !== "legacy_owned" && truck.truckClass !== "third_party" && truck.truckClass !== "tolson_owned") {
    return {
      ok: false,
      blocker: {
        rule: "missing_fee_contract",
        message: `Truck ${truck.unitNumber} has no fee setup. Open the truck and set Tolson payable or the management fee.`,
        ref: truck.id,
      },
    };
  }
  return { ok: true, fees: feesFromPercent(truck, grossCents) };
}

function emptyFees(truckClass: TruckClass): ResolvedFees {
  return {
    contractId: null,
    truckClass,
    driverPayCents: 0,
    managementFeeCents: 0,
    tolsonPayableCents: 0,
    legacyRetainedCents: 0,
    dispatchFeeCents: 0,
    factoringFeeCents: 0,
    lines: [],
  };
}

function feesFromContract(
  truck: StatementTruck,
  weekStart: string,
  stored: StatementContract[],
  grossCents: number,
  loads: StatementLoad[],
): ResolvedFees {
  const records = toContractRecords(stored);
  const contract = findContractForDate(records, weekStart);
  const full = stored.find((row) => row.id === contract.id);
  if (!full) throw new Error(`No fee contract covers date ${weekStart}`);
  for (const load of loads) {
    const day = findContractForDate(records, load.deliveryDate);
    if (day.id !== contract.id) {
      throw new Error(`Rates change inside week ${weekStart} (contracts ${contract.id} and ${day.id})`);
    }
  }
  const calculated = calculateFeeLines({
    grossCents,
    truckClass: truck.truckClass,
    rules: full.rules,
  });
  const tolsonFixed =
    truck.tolsonFixedCents != null && feeIsActive(truck.tolsonEffectiveFrom, weekStart) ? truck.tolsonFixedCents : null;
  const legacyFixed =
    ownerPaysManagementTotal(truck.truckClass) &&
    truck.legacyFixedCents != null &&
    feeIsActive(truck.legacyEffectiveFrom, weekStart)
      ? truck.legacyFixedCents
      : null;
  const lines = calculated.map((line) => feeLineFromResult(truck.truckClass, line));
  const tolsonPayableCents = tolsonFixed ?? feeAmount(calculated, "TOLSON_PAYABLE");
  const legacyRetainedCents = legacyFixed ?? feeAmount(calculated, "LEGACY_RETAINED");
  if (tolsonFixed != null) applyFixedAmount(lines, "TOLSON_PAYABLE", tolsonFixed);
  if (legacyFixed != null) applyFixedAmount(lines, "LEGACY_RETAINED", legacyFixed);
  return {
    contractId: contract.id,
    truckClass: truck.truckClass,
    driverPayCents: feeAmount(calculated, "DRIVER_PAY"),
    managementFeeCents: feeAmount(calculated, "MANAGEMENT_FEE"),
    tolsonPayableCents,
    legacyRetainedCents,
    dispatchFeeCents: feeAmount(calculated, "DISPATCH_FEE"),
    factoringFeeCents: feeAmount(calculated, "FACTORING_FEE"),
    lines,
  };
}

/** Two lines, each a percent of this gross. The total is their sum. Computed once. */
function feesFromPercent(truck: StatementTruck, grossCents: number): ResolvedFees {
  const rates =
    truck.legacyFeeBp != null && truck.tolsonLeaseFeeBp != null
      ? { legacyFeeBp: truck.legacyFeeBp, tolsonLeaseFeeBp: truck.tolsonLeaseFeeBp }
      : seededFeeRates(truck.unitNumber);
  const split = managementFeeSplit(grossCents, rates);
  const truckClass = feeClassFor(truck);
  const owned = !ownerPaysManagementTotal(truckClass);
  const managementFeeCents = owned ? 0 : split.managementFeeCents;
  const tolsonPayableCents = owned ? split.managementFeeCents : split.tolsonLeaseFeeCents;
  const lines: StatementLine[] = [
    percentLine("MANAGEMENT_FEE", managementFeeCents, rates.legacyFeeBp + rates.tolsonLeaseFeeBp, true, !owned),
    percentLine("TOLSON_PAYABLE", owned ? split.managementFeeCents : split.tolsonLeaseFeeCents, rates.tolsonLeaseFeeBp, true, owned),
    percentLine("LEGACY_RETAINED", split.legacyFeeCents, rates.legacyFeeBp, true, false),
  ];
  return {
    contractId: `default:${truck.id}`,
    truckClass,
    driverPayCents: 0,
    managementFeeCents,
    tolsonPayableCents,
    legacyRetainedCents: split.legacyFeeCents,
    dispatchFeeCents: 0,
    factoringFeeCents: 0,
    lines,
  };
}

/**
 * Fee lines for a sheet gross when no statement has been built yet.
 * The owner week uses this unit for the fee. It does not recompute the percent.
 */
export function percentFeeStatement(input: {
  unitNumber: string;
  truckClass?: TruckClass;
  grossCents: number;
  weekStart: string;
  legacyFeeBp?: number | null;
  tolsonLeaseFeeBp?: number | null;
}): UnitStatement {
  const truck: StatementTruck = {
    id: input.unitNumber,
    unitNumber: input.unitNumber,
    truckClass: input.truckClass ?? "third_party",
    legacyFeeBp: input.legacyFeeBp,
    tolsonLeaseFeeBp: input.tolsonLeaseFeeBp,
  };
  const fees = feesFromPercent(truck, input.grossCents);
  const unit: UnitStatement = {
    truckId: truck.id,
    unitNumber: truck.unitNumber,
    truckClass: fees.truckClass,
    contractId: fees.contractId,
    grossCents: input.grossCents,
    driverPayCents: fees.driverPayCents,
    managementFeeCents: fees.managementFeeCents,
    tolsonPayableCents: fees.tolsonPayableCents,
    legacyRetainedCents: fees.legacyRetainedCents,
    dispatchFeeCents: 0,
    factoringFeeCents: 0,
    fuelCents: 0,
    tollsCents: 0,
    fixedOwnerCents: 0,
    fixedManagementCents: 0,
    netCents: 0,
    loadCount: 0,
    loadedMilesHundredths: 0,
    deadheadMilesHundredths: 0,
    lines: fees.lines,
  };
  unit.netCents = expectedNetCents(unit);
  return unit;
}

function ownerSeesFee(truckClass: TruckClass, kind: FeeRuleKind): boolean {
  if (kind === "LEGACY_RETAINED") return false;
  if (kind === "TOLSON_PAYABLE") return truckClass === "legacy_owned";
  if (kind === "MANAGEMENT_FEE") return ownerPaysManagementTotal(truckClass);
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

function percentLine(
  kind: "MANAGEMENT_FEE" | "TOLSON_PAYABLE" | "LEGACY_RETAINED",
  cents: number,
  rateBp: number,
  ownerVisible: boolean,
  charged: boolean,
): StatementLine {
  return {
    lineCode: kind,
    label: FEE_LABELS[kind],
    amountCents: cents,
    rateBp,
    basePctBp: 10000,
    chargedTo: charged && cents > 0 ? "owner" : null,
    ownerVisible,
    sortOrder: FEE_SORT[kind],
  };
}

function feeLineFromResult(truckClass: TruckClass, line: FeeLineResult): StatementLine {
  const ownerVisible = ownerSeesFee(truckClass, line.kind);
  return {
    lineCode: line.kind,
    label: FEE_LABELS[line.kind],
    amountCents: line.amountCents,
    rateBp: line.rateBp,
    basePctBp: line.basePctBp,
    chargedTo: ownerVisible ? "owner" : null,
    ownerVisible,
    sortOrder: FEE_SORT[line.kind],
  };
}

function applyFixedAmount(lines: StatementLine[], kind: "TOLSON_PAYABLE" | "LEGACY_RETAINED", cents: number): void {
  const line = lines.find((row) => row.lineCode === kind);
  if (!line) return;
  line.amountCents = cents;
  line.rateBp = null;
  line.basePctBp = null;
}

function feeAmount(lines: FeeLineResult[], kind: FeeRuleKind): number {
  return lines.find((line) => line.kind === kind)?.amountCents ?? 0;
}

function contractCovers(contract: StatementContract, date: string): boolean {
  if (contract.effectiveFrom > date) return false;
  if (contract.effectiveTo !== null && contract.effectiveTo < date) return false;
  return true;
}

function feeIsActive(from: string | null | undefined, weekStart: string): boolean {
  return from == null || from === "" || from <= weekStart;
}

function feeModelFor(truck: StatementTruck): "lease_to_tolson" | "owner_management" | null {
  if (truck.truckClass === "tolson_owned") return "owner_management";
  if (truck.feeModel === "lease_to_tolson" || truck.feeModel === "owner_management") return truck.feeModel;
  if (truck.truckClass === "legacy_owned") return "lease_to_tolson";
  if (truck.truckClass === "third_party") return "owner_management";
  return null;
}

function feeClassFor(truck: StatementTruck): TruckClass {
  if (truck.truckClass === "tolson_owned") return "tolson_owned";
  const model = feeModelFor(truck);
  if (model === "lease_to_tolson") return "legacy_owned";
  if (model === "owner_management") return "third_party";
  return truck.truckClass;
}

function ensureUnsetLine(lines: StatementLine[], kind: "TOLSON_PAYABLE" | "LEGACY_RETAINED"): void {
  if (lines.some((line) => line.lineCode === kind)) return;
  lines.push({
    lineCode: kind,
    label: FEE_LABELS[kind],
    amountCents: 0,
    rateBp: null,
    basePctBp: null,
    chargedTo: null,
    ownerVisible: false,
    sortOrder: FEE_SORT[kind],
  });
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
