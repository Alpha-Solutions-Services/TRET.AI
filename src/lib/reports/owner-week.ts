import { centsPerLoadedMile } from "@/lib/reports/format";
import { inWeek, normalizeHeader } from "@/lib/sheets/cell";
import { parseLoadLedger, type LedgerLoadRow } from "@/lib/sheets/ledger";
import { outsFromWeeklyExpenses } from "@/lib/sheets/weekly-expenses";

type SheetGrid = string[][];

export type OwnerPendingLoad = {
  loadId: string;
  reason: string;
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
  /** Week Report MPG. Null when that cell is blank. */
  mpg: string | null;
  miscCents: number;
  expenseCents: number;
  netCents: number;
  categories: OwnerCategory[];
  pending: OwnerPendingLoad[];
  loadIds: string[];
};

export const TONU_RATE_NOTE = "TONU rate unconfirmed";

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
}): OwnerTruckWeek {
  const parsed = input.ledger ? parseLoadLedger(input.ledger) : null;
  const counted: LedgerLoadRow[] = [];
  const pending: OwnerPendingLoad[] = [];
  const nextEnd = shiftDay(input.weekEnd, 7);
  for (const row of parsed?.rows ?? []) {
    const tonu = isTonu(row.status);
    const inThis = inWeek(row.deliveryDay, input.weekStart, input.weekEnd);
    const inNext = Boolean(row.deliveryDay) && row.deliveryDay > input.weekEnd && row.deliveryDay <= nextEnd;
    const inTransit = !row.deliveryDay && row.pickupDay != null && row.pickupDay <= input.weekEnd;
    if (tonu && (inThis || inNext || inTransit)) {
      pending.push({ loadId: row.loadId, reason: TONU_RATE_NOTE });
      continue;
    }
    if (inThis) {
      counted.push(row);
      continue;
    }
    if (inNext) pending.push({ loadId: row.loadId, reason: "Delivers next week" });
    else if (inTransit) pending.push({ loadId: row.loadId, reason: "In transit" });
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

  const milesFromAllocated = Boolean(parsed?.allocatedColumn);
  const milesHundredths = milesFromAllocated ? allocatedMilesOnce(counted) : 0;
  return {
    loadCount,
    grossCents,
    milesHundredths,
    milesFromAllocated,
    rpmCents: milesFromAllocated ? centsPerLoadedMile(grossCents, milesHundredths) : null,
    mpg: weekReportMpg(input.weekReport),
    miscCents,
    expenseCents,
    netCents: grossCents - expenseCents,
    categories,
    pending,
    loadIds,
  };
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

/** Column P once per trip. The primary row wins when it has miles. Otherwise the largest cell. */
function allocatedMilesOnce(rows: readonly LedgerLoadRow[]): number {
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
    const primary = group.find((row) => row.sheetPrimary === true && (row.allocatedMilesHundredths ?? 0) > 0);
    const values = group.map((row) => row.allocatedMilesHundredths ?? 0);
    total += primary?.allocatedMilesHundredths ?? Math.max(0, ...values);
  }
  return total;
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
