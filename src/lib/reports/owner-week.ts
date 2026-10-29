import { weekBoundsForDate, type TruckClass } from "@/lib/fee-engine";
import { mondayOfIsoWeek } from "@/lib/reports/delivery";
import { ownerPaysManagementTotal } from "@/lib/fees/kinds";
import type { FeeRatePair, FeeSplit } from "@/lib/fees/two-lines";
import { centsPerLoadedMile, formatDollarsPerMile, formatPositiveDecimal } from "@/lib/reports/format";
import { tripOpenAtSunday } from "@/lib/reports/trip-metrics";
import { percentFeeStatement } from "@/lib/statements/engine";
import type { UnitStatement } from "@/lib/statements/types";
import { gallonsStringToMilli } from "@/lib/fuel-tolls/quantity";
import { tonuHoldWeekStart } from "@/lib/loads/tonu";
import { inWeek, isEmptyCell, normalizeHeader, sheetAmountToCents, sheetDay } from "@/lib/sheets/cell";
import { parseLoadLedger, type LedgerLoadRow } from "@/lib/sheets/ledger";
import { outsFromWeeklyExpenses } from "@/lib/sheets/weekly-expenses";

type SheetGrid = string[][];

export type OwnerPendingLoad = {
  loadId: string;
  reason: string;
};

export type OwnerLoadStatus = "Delivered" | "Pending" | "TONU";

/** One ledger row in this week's shared calculation, including pending and TONU. */
export type OwnerWeekLoad = {
  loadId: string;
  status: OwnerLoadStatus;
  deliveryDay: string;
  pickupDay: string | null;
  rateCents: number | null;
  reason: string | null;
  manifestId: string | null;
  tripGroup: string | null;
  sheetPrimary: boolean | null;
  driver: string | null;
  origin: string | null;
  destination: string | null;
  loadedMilesHundredths: number | null;
  deadheadMilesHundredths: number | null;
  /** Ledger column M. Null when that cell is blank. */
  ledgerMilesHundredths: number | null;
  /** Load Ledger Tarps column, in cents. Already inside sheet driver pay. Zero when the cell is blank. */
  tarpCents?: number;
};

export type OwnerCategory = {
  category: string;
  cents: number;
};

/** One truck, one Monday–Sunday week, from the truck sheet. */
export type OwnerTruckWeek = {
  loadCount: number;
  grossCents: number;
  /** Allocated miles when that column exists. Zero when it does not. */
  milesHundredths: number;
  milesFromAllocated: boolean;
  rpmCents: number | null;
  /** Week Report F7, four decimals. Null when truck miles are zero. */
  rpmLabel: string | null;
  /** Week Report MPG. Null only when that cell is blank or 0. */
  mpg: string | null;
  /** True when a counted load shares a trip with a row that delivers later. */
  tripOpen: boolean;
  miscCents: number;
  expenseCents: number;
  netCents: number;
  /** Allocated deadhead (Week Report C18, or Ledger AV once per trip). */
  deadheadHundredths: number;
  deadheadKnown: boolean;
  categories: OwnerCategory[];
  pending: OwnerPendingLoad[];
  loadIds: string[];
  /** Delivered, pending, and TONU rows for this week. The Loads page uses this list. */
  loads: OwnerWeekLoad[];
  /** Week Report grid when weekReportApplies is true. Null when this report is another week. */
  appliedWeekReport?: SheetGrid | null;
  /** Legacy fee and Tolson lease fee, each a percent of weekly gross. Expenses use the total. */
  fees: FeeSplit;
  /** True when the sheet Management Fee cell is not the percent-of-gross total. */
  sheetFeeDiffers: boolean;
  /** Shown on the truck week. A bad fee split, or a Weekly Expenses cell that could not be read. */
  warnings: string[];
  /** Sheet AN and AO when they add up to column H. Otherwise the calculated split. */
  feeSplit: { legacyFeeCents: number; tolsonFeeCents: number };
};

export const TONU_RATE_NOTE = "TONU rate unconfirmed";
export const SHEET_FEE_DIFFERS = "sheet fee differs";

/**
 * Owner-week figures from the Load Ledger, Weekly Expenses, and Week Report.
 * Fuel, tolls, fees, and miles are the sheet cells. They are not recomputed from imports.
 * A held or pending TONU stays out of gross. Its deadhead miles count in the week it is
 * counted. Tolls follow the load's own week: a sheet toll cell is kept, and a counted
 * TONU toll is added only when that week has no toll cell.
 */
export function buildOwnerTruckWeek(input: {
  ledger: SheetGrid | null;
  weekly: SheetGrid | null;
  weekReport?: SheetGrid | null;
  weekStart: string;
  weekEnd: string;
  /** Used only when the Weekly Expenses tab has no header. */
  fallbackOutsCents?: number;
  fallbackCategories?: readonly OwnerCategory[];
  /** Blank uses the truck seed. Trucks 1 to 10 are seeded. A new truck is Legacy 10 percent and Tolson 8 percent. */
  unitNumber?: string;
  truckClass?: TruckClass;
  feeRates?: FeeRatePair;
  /**
   * When a statement was already built, its fee lines and class are the fee.
   * Sheet-only callers omit this and the same engine builds the unit.
   */
  statement?: UnitStatement;
}): OwnerTruckWeek {
  const parsed = input.ledger ? parseLoadLedger(input.ledger, { unitNumber: input.unitNumber }) : null;
  const counted: LedgerLoadRow[] = [];
  /** Delivered this week and held out of gross. Deadhead waits until the count week. */
  const tonuHeld: LedgerLoadRow[] = [];
  /** Counted this week. Deadhead lands here. Its toll is used only when this week has no toll cell. */
  const tonuCounted: LedgerLoadRow[] = [];
  const pending: OwnerPendingLoad[] = [];
  const loads: OwnerWeekLoad[] = [];
  let heldTonuCents = 0;
  const nextEnd = shiftDay(input.weekEnd, 7);
  for (const row of parsed?.rows ?? []) {
    const tonu = isTonu(row.status);
    const inThis = inWeek(row.deliveryDay, input.weekStart, input.weekEnd);
    const inNext = Boolean(row.deliveryDay) && row.deliveryDay > input.weekEnd && row.deliveryDay <= nextEnd;
    const inTransit = !row.deliveryDay && row.pickupDay != null && row.pickupDay <= input.weekEnd;
    if (tonu) {
      const countWeek = row.deliveryDay ? tonuHoldWeekStart(row.deliveryDay) : null;
      if (countWeek === input.weekStart) {
        tonuCounted.push(row);
        pending.push({ loadId: row.loadId, reason: TONU_RATE_NOTE });
        loads.push(weekLoad(row, "TONU", TONU_RATE_NOTE));
        continue;
      }
      if (inThis || inNext || inTransit) {
        if (inThis) {
          heldTonuCents += row.rateCents ?? 0;
          tonuHeld.push(row);
        }
        pending.push({ loadId: row.loadId, reason: TONU_RATE_NOTE });
        loads.push(weekLoad(row, "TONU", TONU_RATE_NOTE));
        continue;
      }
    }
    if (inThis) {
      counted.push(row);
      loads.push(weekLoad(row, "Delivered", null));
      continue;
    }
    if (inNext) {
      pending.push({ loadId: row.loadId, reason: "Delivers next week" });
      loads.push(weekLoad(row, "Pending", "Delivers next week"));
    } else if (inTransit) {
      pending.push({ loadId: row.loadId, reason: "In transit" });
      loads.push(weekLoad(row, "Pending", "In transit"));
    }
  }

  let grossCents = 0;
  let loadCount = 0;
  let miscCents = 0;
  const loadIds: string[] = [];
  for (const row of counted) {
    miscCents += row.miscCents;
    if (row.rateCents == null) continue;
    grossCents += row.rateCents;
    loadCount += 1;
    loadIds.push(row.loadId);
  }

  const weekly = input.weekly ? outsFromWeeklyExpenses(input.weekly, input.weekStart, input.weekEnd) : null;
  const useWeekly = Boolean(weekly?.headerFound);
  const categories: OwnerCategory[] = useWeekly
    ? weekly!.categories.map((row) => ({ ...row }))
    : (input.fallbackCategories ?? []).map((row) => ({ ...row }));
  let expenseCents = useWeekly ? weekly!.outsCents : (input.fallbackOutsCents ?? 0);
  if (miscCents !== 0) {
    const misc = categories.find((row) => row.category === "Misc");
    if (misc) misc.cents += miscCents;
    else categories.push({ category: "Misc", cents: miscCents });
    expenseCents += miscCents;
  }

  let milesFromAllocated = Boolean(parsed?.allocatedColumn);
  let milesHundredths = milesFromAllocated ? allocatedMilesOnce(counted, "allocated") : 0;
  const reportApplies = weekReportApplies(input.weekReport, input.weekStart, grossCents, heldTonuCents);
  const reportGrid = reportApplies ? (input.weekReport ?? null) : null;
  const report = readWeekReportMoney(reportGrid);
  if (report.grossCents != null) {
    const includesHeldTonu = heldTonuCents > 0 && report.grossCents === grossCents + heldTonuCents;
    if (!includesHeldTonu) grossCents = report.grossCents;
  }
  if (report.milesHundredths != null) {
    milesHundredths = report.milesHundredths;
    milesFromAllocated = true;
  }
  if (report.miscCents != null) replaceCategory(categories, "Misc", report.miscCents);
  if (report.driverCents != null) replaceCategory(categories, "Driver compensation", report.driverCents);
  if (report.dispatchCents != null) replaceCategory(categories, "Dispatch fee", report.dispatchCents);
  if (report.factoringCents != null) replaceCategory(categories, "Factoring fee", report.factoringCents);
  if (report.managementCents != null) replaceCategory(categories, "Management fee", report.managementCents);
  if (report.fuelCents != null) replaceCategory(categories, "Fuel", report.fuelCents);
  if (report.tollCents != null) replaceCategory(categories, "Toll fees", report.tollCents);
  const countedTollCents = counted.reduce((sum, row) => sum + row.tollCents, 0);
  const arrivingTollCents = tonuCounted.reduce((sum, row) => sum + row.tollCents, 0);
  const tollFromSheet = categories.some((row) => row.category === "Toll fees");
  const chosenTollCents = categories.find((row) => row.category === "Toll fees")?.cents ?? 0;
  const tollCents = tollFromSheet ? chosenTollCents : addArriving(chosenTollCents, countedTollCents, arrivingTollCents);
  if (tollCents !== chosenTollCents) replaceCategory(categories, "Toll fees", tollCents);
  miscCents = categories.find((row) => row.category === "Misc")?.cents ?? 0;
  const countedDeadhead = parsed?.allocatedDeadheadColumn ? allocatedMilesOnce(counted, "deadhead") : 0;
  const heldDeadhead = deadheadOf(tonuHeld, parsed);
  const arrivingDeadhead = deadheadOf(tonuCounted, parsed);
  const deadheadBase = report.deadheadHundredths ?? countedDeadhead;
  const deadheadHundredths = adjustForTonu(deadheadBase, countedDeadhead, heldDeadhead, arrivingDeadhead);
  const deadheadKnown =
    report.deadheadHundredths != null || parsed?.allocatedDeadheadColumn === true || arrivingDeadhead > 0;
  const countedMiles = parsed?.allocatedColumn ? allocatedMilesOnce(counted, "allocated") : 0;
  const heldMiles = tonuTruckMiles(tonuHeld, parsed);
  const arrivingMiles = tonuTruckMiles(tonuCounted, parsed);
  const milesBefore = milesHundredths;
  milesHundredths = adjustForTonu(milesHundredths, countedMiles, heldMiles, arrivingMiles);
  if (milesHundredths !== milesBefore) milesFromAllocated = true;
  const tripOpen = tripOpenAtSunday(
    loads.map((load) => ({
      tripRef: load.tripGroup || load.manifestId,
      deliveryDay: load.deliveryDay?.trim() || null,
    })),
    input.weekEnd,
  );
  const mpg = report.mpg ?? weekReportMpg(reportGrid);
  const sheetManagement = categories.find((row) => row.category === "Management fee")?.cents ?? null;
  const statement =
    input.statement ??
    percentFeeStatement({
      unitNumber: input.unitNumber ?? "",
      truckClass: input.truckClass,
      grossCents,
      weekStart: input.weekStart,
      legacyFeeBp: input.feeRates?.legacyFeeBp,
      tolsonLeaseFeeBp: input.feeRates?.tolsonLeaseFeeBp,
    });
  const fees = feeSplitFromUnit(statement);
  const sheetFeeDiffers = sheetManagement != null && sheetManagement !== fees.managementFeeCents;
  const feeTotal = sheetManagement ?? 0;
  let legacyPart = weekly?.legacyFeeCents ?? null;
  let tolsonPart = weekly?.tolsonFeeCents ?? null;
  if (reportApplies && report.legacyFeeCents != null) legacyPart = report.legacyFeeCents;
  if (reportApplies && report.tolsonFeeCents != null) tolsonPart = report.tolsonFeeCents;
  const warnings: string[] = [...(weekly?.warnings ?? [])];
  let feeSplit = { legacyFeeCents: fees.legacyFeeCents, tolsonFeeCents: fees.tolsonLeaseFeeCents };
  if (legacyPart != null && tolsonPart != null) {
    if (legacyPart + tolsonPart === feeTotal) {
      feeSplit = { legacyFeeCents: legacyPart, tolsonFeeCents: tolsonPart };
    } else {
      warnings.push("Legacy plus Tolson doesn't equal H.");
    }
  }
  // Sheet and Week Report driver pay already include Tarps. Do not add that column again.
  expenseCents = categories.reduce((sum, row) => sum + row.cents, 0);
  const netCents = grossCents - expenseCents;
  return {
    loadCount,
    grossCents,
    milesHundredths,
    milesFromAllocated,
    rpmCents: milesFromAllocated ? centsPerLoadedMile(grossCents, milesHundredths) : null,
    rpmLabel: milesFromAllocated ? rpmLabelFromReport(reportGrid, grossCents, milesHundredths) : null,
    mpg,
    tripOpen,
    miscCents,
    expenseCents,
    netCents,
    deadheadHundredths,
    deadheadKnown,
    categories,
    pending,
    loadIds,
    loads,
    fees,
    sheetFeeDiffers,
    warnings,
    feeSplit,
    appliedWeekReport: reportGrid,
  };
}

/** A counted TONU's toll is added once when this week has no toll cell yet. */
function addArriving(shown: number, counted: number, arriving: number): number {
  if (arriving <= 0) return shown;
  return shown >= counted + arriving ? shown : shown + arriving;
}

/**
 * Take a held TONU's miles out of this week when the sheet total still sits above the counted rows,
 * then put a counted TONU's miles into this week, once.
 */
function adjustForTonu(shown: number, counted: number, held: number, arriving: number): number {
  const stripped = held > 0 && shown - held >= counted ? shown - held : shown;
  if (arriving <= 0) return stripped;
  return stripped >= counted + arriving ? stripped : stripped + arriving;
}

/** The statement unit's two fee lines. The total replaces the sheet Management Fee cell. */
function feeSplitFromUnit(unit: UnitStatement): FeeSplit {
  const legacyFeeCents = unit.legacyRetainedCents;
  const managementFeeCents = ownerPaysManagementTotal(unit.truckClass)
    ? unit.managementFeeCents
    : unit.tolsonPayableCents;
  return {
    legacyFeeBp: lineRate(unit, "LEGACY_RETAINED"),
    tolsonLeaseFeeBp: lineRate(unit, "TOLSON_PAYABLE"),
    legacyFeeCents,
    tolsonLeaseFeeCents: managementFeeCents - legacyFeeCents,
    managementFeeCents,
  };
}

function lineRate(unit: UnitStatement, code: string): number {
  return unit.lines.find((line) => line.lineCode === code)?.rateBp ?? 0;
}

function deadheadOf(rows: readonly LedgerLoadRow[], parsed: { allocatedDeadheadColumn: boolean } | null): number {
  if (rows.length === 0) return 0;
  const allocated = parsed?.allocatedDeadheadColumn ? allocatedMilesOnce(rows, "deadhead") : 0;
  if (allocated > 0) return allocated;
  return rows.reduce((sum, row) => sum + (row.deadheadMilesHundredths ?? 0), 0);
}

function tonuTruckMiles(rows: readonly LedgerLoadRow[], parsed: { allocatedColumn: boolean } | null): number {
  if (rows.length === 0) return 0;
  if (parsed?.allocatedColumn) {
    const allocated = allocatedMilesOnce(rows, "allocated");
    if (allocated > 0) return allocated;
  }
  return rows.reduce((sum, row) => sum + (row.allocatedDeadheadHundredths ?? row.deadheadMilesHundredths ?? 0), 0);
}

function weekLoad(row: LedgerLoadRow, status: OwnerLoadStatus, reason: string | null): OwnerWeekLoad {
  return {
    loadId: row.loadId,
    status,
    deliveryDay: row.deliveryDay,
    pickupDay: row.pickupDay,
    rateCents: row.rateCents,
    reason,
    manifestId: row.manifestId,
    tripGroup: row.tripGroup,
    sheetPrimary: row.sheetPrimary,
    driver: row.driver,
    origin: row.origin,
    destination: row.destination,
    loadedMilesHundredths: row.loadedMilesHundredths,
    deadheadMilesHundredths: row.allocatedDeadheadHundredths ?? row.deadheadMilesHundredths,
    ledgerMilesHundredths: row.ledgerMilesHundredths,
    tarpCents: row.tarpCents,
  };
}

function replaceCategory(categories: OwnerCategory[], name: string, cents: number): void {
  const found = categories.find((row) => row.category === name);
  if (found) found.cents = cents;
  else if (cents !== 0) categories.push({ category: name, cents });
}

const WEEK_REPORT_LABELS = new Set([
  "week start",
  "week start date",
  "week starting",
  "week of",
  "week ending",
  "report week",
]);

function wholeNumber(raw: string): number | null {
  const text = raw.trim().replace(/\.0+$/, "");
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * Monday the Week Report is for.
 * A date label wins. Otherwise Week # and Year, which is how the live sheets are labeled.
 */
export function labeledWeekStart(grid: SheetGrid | null | undefined): string | null {
  if (!grid) return null;
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeHeader(row[index] ?? "");
      if (!WEEK_REPORT_LABELS.has(label)) continue;
      for (let next = index + 1; next < Math.min(row.length, index + 4); next += 1) {
        const day = sheetDay(row[next] ?? "");
        if (!day) continue;
        return weekBoundsForDate(day).start;
      }
    }
  }
  let weekNum: number | null = null;
  let year: number | null = null;
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeHeader(row[index] ?? "");
      const value = wholeNumber(row[index + 1] ?? "");
      if (value == null) continue;
      if ((label.startsWith("week #") || label === "week number") && value >= 1 && value <= 53) weekNum = value;
      if (label.startsWith("year") && value >= 2000 && value <= 2100) year = value;
    }
  }
  if (weekNum == null || year == null) return null;
  return mondayOfIsoWeek(year, weekNum);
}

/**
 * A Week Report applies only to the week it belongs to.
 * A labeled week that is not this week is ignored.
 * An unlabeled report applies when its revenue matches this week's ledger, including a held TONU.
 * A different revenue is another week's report and is not applied.
 */
export function weekReportApplies(
  grid: SheetGrid | null | undefined,
  weekStart: string,
  ledgerGrossCents: number,
  heldTonuCents: number,
): boolean {
  if (!grid) return false;
  const labeled = labeledWeekStart(grid);
  if (labeled) return labeled === weekStart;
  const report = readWeekReportMoney(grid);
  if (report.grossCents == null) return true;
  if (report.grossCents === ledgerGrossCents) return true;
  return heldTonuCents > 0 && report.grossCents === ledgerGrossCents + heldTonuCents;
}

type WeekReportMoney = {
  grossCents: number | null;
  expenseCents: number | null;
  milesHundredths: number | null;
  driverCents: number | null;
  dispatchCents: number | null;
  factoringCents: number | null;
  legacyFeeCents: number | null;
  tolsonFeeCents: number | null;
  managementCents: number | null;
  fuelCents: number | null;
  tollCents: number | null;
  miscCents: number | null;
  deadheadHundredths: number | null;
  mpg: string | null;
};

/** Week Report cells named in the operator checklist. A blank cell stays null. */
export function readWeekReportMoney(grid: SheetGrid | null | undefined): WeekReportMoney {
  const empty: WeekReportMoney = {
    grossCents: null,
    expenseCents: null,
    milesHundredths: null,
    driverCents: null,
    dispatchCents: null,
    factoringCents: null,
    legacyFeeCents: null,
    tolsonFeeCents: null,
    managementCents: null,
    fuelCents: null,
    tollCents: null,
    miscCents: null,
    deadheadHundredths: null,
    mpg: weekReportMpg(grid),
  };
  if (!grid) return empty;
  return {
    grossCents: reportMoney(grid, ["total revenue"], 3, 2),
    expenseCents: reportMoney(grid, ["total expenses", "total weekly expense"], 3, 5),
    milesHundredths: reportMoney(grid, ["total miles"], 18, 2),
    dispatchCents: reportMoney(grid, ["dispatch fee"], 21, 2),
    factoringCents: moneyByLabel(grid, ["factoring fee", "factoring fee (rounded to cents)"]),
    driverCents: reportMoney(grid, ["driver pay", "driver compensation"], 23, 2),
    managementCents: reportMoney(grid, ["management fee", "total fees (legacy+tolson)", "total fees (legacy + tolson)"], 24, 2),
    fuelCents: reportMoney(grid, ["fuel total cost", "fuel total"], 28, 2),
    tollCents: reportMoney(grid, ["toll fees"], 29, 14),
    miscCents: reportMoney(grid, ["misc expenses", "misc expenses (1-5)"], 25, 14),
    deadheadHundredths: reportMoney(grid, ["deadhead miles", "deadhead", "alloc deadhead"], 17, 2),
    legacyFeeCents: moneyByLabel(grid, ["legacy fee", "legacy fee (in total)"]),
    tolsonFeeCents: moneyByLabel(grid, ["tolson fee", "tolson fee (in total)"]),
    mpg: empty.mpg,
  };
}

function reportMoney(grid: SheetGrid, labels: readonly string[], rowIndex: number, colIndex: number): number | null {
  const labeled = moneyByLabel(grid, labels);
  if (labeled != null) return labeled;
  return sheetAmountToCents(grid[rowIndex]?.[colIndex] ?? "");
}

function moneyByLabel(grid: SheetGrid, labels: readonly string[]): number | null {
  const wanted = new Set(labels);
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeHeader(row[index] ?? "");
      if (!wanted.has(label)) continue;
      for (let next = index + 1; next < row.length; next += 1) {
        const raw = row[next] ?? "";
        if (isEmptyCell(raw)) continue;
        return sheetAmountToCents(raw);
      }
    }
  }
  return null;
}

export type WeekReportGallons = {
  dieselMilli: number | null;
  defMilli: number | null;
};

/**
 * Week Report gallons. A labeled gallons cell wins.
 * Otherwise cell C28 when it is a gallon figure. A dollar amount is not gallons.
 */
export function weekReportGallons(grid: SheetGrid | null | undefined): WeekReportGallons {
  if (!grid) return { dieselMilli: null, defMilli: null };
  return {
    dieselMilli:
      gallonsByLabel(grid, ["diesel gallons", "fuel gallons", "total gallons", "gallons"]) ??
      gallonsCell(grid[27]?.[2] ?? ""),
    defMilli: gallonsByLabel(grid, ["def gallons", "def"]),
  };
}

function gallonsByLabel(grid: SheetGrid, labels: readonly string[]): number | null {
  const wanted = new Set(labels);
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeHeader(row[index] ?? "");
      if (!wanted.has(label)) continue;
      for (let next = index + 1; next < row.length; next += 1) {
        const gallons = gallonsCell(row[next] ?? "");
        if (gallons != null) return gallons;
      }
    }
  }
  return null;
}

function gallonsCell(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,]/g, "");
  if (!cleaned || raw.includes("$")) return null;
  try {
    const milli = gallonsStringToMilli(cleaned);
    return milli > 0 ? milli : null;
  } catch {
    return null;
  }
}

/** Week Report MPG. A labeled MPG cell wins. Otherwise cell C31. */
export function weekReportMpg(grid: SheetGrid | null | undefined): string | null {
  if (!grid) return null;
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeHeader(row[index] ?? "");
      if (label !== "mpg" && label !== "diesel mpg" && label !== "miles per gallon") continue;
      const labeled = mpgText(row[index + 1] ?? "") ?? mpgText(row[index + 2] ?? "");
      if (labeled) return labeled;
    }
  }
  return mpgText(grid[30]?.[2] ?? "");
}

function isTonu(status: string | null): boolean {
  return /\btonu\b/i.test(status ?? "");
}

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Column P, or Alloc Deadhead, once per trip. The primary row wins when it has miles. Otherwise the largest cell. */
function allocatedMilesOnce(rows: readonly LedgerLoadRow[], field: "allocated" | "deadhead"): number {
  const groups = new Map<string, LedgerLoadRow[]>();
  for (const row of rows) {
    const trip = (row.tripGroup || row.manifestId || "").trim();
    const key = trip || `load:${row.loadId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  let total = 0;
  for (const group of groups.values()) {
    const valueOf = (row: LedgerLoadRow) =>
      field === "deadhead" ? (row.allocatedDeadheadHundredths ?? 0) : (row.allocatedMilesHundredths ?? 0);
    const primary = group.find((row) => row.sheetPrimary === true && valueOf(row) > 0);
    const values = group.map(valueOf);
    total += primary ? valueOf(primary) : Math.max(0, ...values);
  }
  return total;
}

/** Week Report F7 when that cell is filled. Otherwise revenue divided by truck miles, four decimals, half up. */
function rpmLabelFromReport(grid: SheetGrid | null | undefined, grossCents: number, milesHundredths: number): string | null {
  const shown = readShownRpm(grid);
  if (shown) return shown;
  return formatDollarsPerMile(grossCents, milesHundredths, 4);
}

function readShownRpm(grid: SheetGrid | null | undefined): string | null {
  if (!grid) return null;
  const labels = new Set(["avg rate / mile", "avg rate/mile", "rate per mile"]);
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      if (!labels.has(normalizeHeader(row[index] ?? ""))) continue;
      for (let next = index + 1; next < row.length; next += 1) {
        const shown = formatPositiveDecimal(row[next] ?? "", 4);
        if (shown) return shown;
      }
    }
  }
  return formatPositiveDecimal(grid[6]?.[5] ?? "", 4);
}

/** Week Report MPG text. A figure above 100.00 is blank. */
function mpgText(raw: string): string | null {
  return formatPositiveDecimal(raw, 2, 10_000);
}
