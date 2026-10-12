import {
  managementFeeSplit,
  seededFeeRates,
  type FeeRatePair,
  type FeeSplit,
} from "@/lib/fees/two-lines";
import { roundHalfUpDivide } from "@/lib/fee-engine/money";
import { centsPerLoadedMile } from "@/lib/reports/format";
import { inWeek, normalizeHeader, sheetAmountToCents } from "@/lib/sheets/cell";
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
  /** Legacy fee and Tolson lease fee, each a percent of weekly gross. Expenses use the total. */
  fees: FeeSplit;
  /** True when the sheet Management Fee cell is not the percent-of-gross total. */
  sheetFeeDiffers: boolean;
};

export const TONU_RATE_NOTE = "TONU rate unconfirmed";
export const SHEET_FEE_DIFFERS = "sheet fee differs";

/**
 * Owner-week figures from the Load Ledger, Weekly Expenses, and Week Report.
 * Fuel, tolls, fees, and miles are the sheet cells. They are not recomputed from imports.
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
  feeRates?: FeeRatePair;
}): OwnerTruckWeek {
  const parsed = input.ledger ? parseLoadLedger(input.ledger) : null;
  const counted: LedgerLoadRow[] = [];
  const pending: OwnerPendingLoad[] = [];
  const loads: OwnerWeekLoad[] = [];
  let heldTonuCents = 0;
  const nextEnd = shiftDay(input.weekEnd, 7);
  for (const row of parsed?.rows ?? []) {
    const tonu = isTonu(row.status);
    const inThis = inWeek(row.deliveryDay, input.weekStart, input.weekEnd);
    const inNext = Boolean(row.deliveryDay) && row.deliveryDay > input.weekEnd && row.deliveryDay <= nextEnd;
    const inTransit = !row.deliveryDay && row.pickupDay != null && row.pickupDay <= input.weekEnd;
    if (tonu && (inThis || inNext || inTransit)) {
      if (inThis) heldTonuCents += row.rateCents ?? 0;
      pending.push({ loadId: row.loadId, reason: TONU_RATE_NOTE });
      loads.push(weekLoad(row, "TONU", TONU_RATE_NOTE));
      continue;
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
  const report = readWeekReportMoney(input.weekReport);
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
  miscCents = categories.find((row) => row.category === "Misc")?.cents ?? 0;
  const rates = input.feeRates ?? seededFeeRates(input.unitNumber ?? "");
  const fees = managementFeeSplit(grossCents, rates);
  const sheetManagement = categories.find((row) => row.category === "Management fee")?.cents ?? null;
  const sheetFeeDiffers = sheetManagement != null && sheetManagement !== fees.managementFeeCents;
  if (sheetManagement != null) replaceCategory(categories, "Management fee", fees.managementFeeCents);
  expenseCents = categories.reduce((sum, row) => sum + row.cents, 0);
  const deadheadFromLedger = parsed?.allocatedDeadheadColumn ? allocatedMilesOnce(counted, "deadhead") : null;
  const deadheadHundredths = report.deadheadHundredths ?? deadheadFromLedger ?? 0;
  const deadheadKnown = report.deadheadHundredths != null || deadheadFromLedger != null;
  const tripOpen = countedTripStillOpen(counted, loads);
  const mpg = report.mpg ?? weekReportMpg(input.weekReport);
  return {
    loadCount,
    grossCents,
    milesHundredths,
    milesFromAllocated,
    rpmCents: milesFromAllocated ? centsPerLoadedMile(grossCents, milesHundredths) : null,
    rpmLabel: milesFromAllocated ? rpmLabelFromReport(input.weekReport, grossCents, milesHundredths) : null,
    mpg,
    tripOpen,
    miscCents,
    expenseCents,
    netCents: grossCents - expenseCents,
    deadheadHundredths,
    deadheadKnown,
    categories,
    pending,
    loadIds,
    loads,
    fees,
    sheetFeeDiffers,
  };
}

/** A counted load whose trip also has a row that delivers later. The Week Report MPG is still used when that cell is filled. */
function countedTripStillOpen(counted: readonly LedgerLoadRow[], loads: readonly OwnerWeekLoad[]): boolean {
  const openKeys = new Set<string>();
  for (const row of loads) {
    if (row.status !== "Pending") continue;
    const trip = (row.tripGroup || row.manifestId || "").trim();
    if (trip) openKeys.add(trip);
  }
  return counted.some((row) => {
    const trip = (row.tripGroup || row.manifestId || "").trim();
    return trip !== "" && openKeys.has(trip);
  });
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
  };
}

function replaceCategory(categories: OwnerCategory[], name: string, cents: number): void {
  const found = categories.find((row) => row.category === name);
  if (found) found.cents = cents;
  else if (cents !== 0) categories.push({ category: name, cents });
}

type WeekReportMoney = {
  grossCents: number | null;
  expenseCents: number | null;
  milesHundredths: number | null;
  driverCents: number | null;
  dispatchCents: number | null;
  factoringCents: number | null;
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
    factoringCents: reportMoney(grid, ["factoring fee"], 22, 2),
    driverCents: reportMoney(grid, ["driver pay", "driver compensation"], 23, 2),
    managementCents: reportMoney(grid, ["management fee"], 24, 2),
    fuelCents: reportMoney(grid, ["fuel total cost", "fuel total"], 28, 2),
    tollCents: reportMoney(grid, ["toll fees"], 29, 14),
    miscCents: reportMoney(grid, ["misc expenses", "misc expenses (1-5)"], 25, 14),
    deadheadHundredths: reportMoney(grid, ["deadhead miles", "deadhead", "alloc deadhead"], 17, 2),
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
        const cents = sheetAmountToCents(row[next] ?? "");
        if (cents != null) return cents;
      }
    }
  }
  return null;
}

/** Week Report MPG. A labeled MPG cell wins. Otherwise cell C31. */
export function weekReportMpg(grid: SheetGrid | null | undefined): string | null {
  if (!grid) return null;
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeHeader(row[index] ?? "");
      if (label !== "mpg" && label !== "diesel mpg" && label !== "miles per gallon") continue;
      const labeled = mpgLabel(row[index + 1] ?? "") ?? mpgLabel(row[index + 2] ?? "");
      if (labeled) return labeled;
    }
  }
  return mpgLabel(grid[30]?.[2] ?? "");
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
  return rpmFourDecimals(grossCents, milesHundredths);
}

function readShownRpm(grid: SheetGrid | null | undefined): string | null {
  if (!grid) return null;
  const labels = new Set(["avg rate / mile", "avg rate/mile", "rate per mile"]);
  for (const row of grid) {
    for (let index = 0; index < row.length; index += 1) {
      if (!labels.has(normalizeHeader(row[index] ?? ""))) continue;
      for (let next = index + 1; next < row.length; next += 1) {
        const shown = fourDecimals(row[next] ?? "");
        if (shown) return shown;
      }
    }
  }
  return fourDecimals(grid[6]?.[5] ?? "");
}

function rpmFourDecimals(grossCents: number, milesHundredths: number): string | null {
  if (milesHundredths <= 0) return null;
  const scaled = Number(roundHalfUpDivide(BigInt(grossCents) * BigInt(10000), BigInt(milesHundredths)));
  const whole = Math.floor(scaled / 10000);
  const frac = String(scaled % 10000).padStart(4, "0");
  return `${whole}.${frac}`;
}

function fourDecimals(raw: string): string | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "00000").slice(0, 5);
  let scaled = Number.parseInt(whole, 10) * 10000 + Number.parseInt(digits.slice(0, 4), 10);
  if ((digits[4] ?? "0") >= "5") scaled += 1;
  if (scaled <= 0) return null;
  return `${Math.floor(scaled / 10000)}.${String(scaled % 10000).padStart(4, "0")}`;
}

function mpgLabel(raw: string): string | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "000").slice(0, 3);
  let hundredths = Number.parseInt(whole, 10) * 100 + Number.parseInt(digits.slice(0, 2), 10);
  if ((digits[2] ?? "0") >= "5") hundredths += 1;
  if (hundredths <= 0 || hundredths > 10_000) return null;
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}
