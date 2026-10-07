import { dollarStringToCents } from "@/lib/money/cents";

/** Categories on the truck sheet Mgmt Expenses dropdown. */
export const MGMT_EXPENSE_CATEGORIES = [
  "Vektor Fee",
  "Sintra AI",
  "Quickbooks",
  "Job Post",
  "Accountant Salary",
  "MVR",
  "Drug Test",
  "Spare Expense 1",
  "Spare Expense 2",
  "Spare Expense 3",
  "Spare Expense 4",
  "Spare Expense 5",
] as const;

export type SheetGrid = string[][];

export type ExpenseCategoryTotal = {
  category: string;
  cents: number;
};

export type TruckWeekInsOuts = {
  unitNumber: string;
  truckName: string;
  /** Load ledger Rate for deliveries in the week. Integer cents. */
  insCents: number;
  /** Mgmt Expenses amounts dated in the week. Integer cents. */
  outsCents: number;
  netCents: number;
  loadCount: number;
  categories: ExpenseCategoryTotal[];
  /** Set when the sheet could not be read, or a tab was missing. */
  note: string | null;
  readable: boolean;
};

const CATEGORY_ORDER = new Map<string, number>(
  MGMT_EXPENSE_CATEGORIES.map((category, index) => [category.toLowerCase(), index]),
);

export function sheetAmountToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[$,\s]/g, "").replace(/[()]/g, "").replace(/^-/, "");
  if (!cleaned) return null;
  try {
    const cents = dollarStringToCents(cleaned);
    return negative ? -cents : cents;
  } catch {
    return null;
  }
}

/** Sheet dates: YYYY-MM-DD, with an optional time, or M/D/YYYY. */
export function sheetDay(raw: string): string | null {
  const text = raw.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1] ?? null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!us) return null;
  const month = us[1]!.padStart(2, "0");
  const day = us[2]!.padStart(2, "0");
  return `${us[3]}-${month}-${day}`;
}

function inWeek(day: string | null, weekStart: string, weekEnd: string): boolean {
  if (!day) return false;
  return day >= weekStart && day <= weekEnd;
}

function findHeader(grid: SheetGrid, required: string[]): number {
  const wanted = required.map((name) => name.toLowerCase());
  for (let index = 0; index < grid.length; index++) {
    const cells = (grid[index] ?? []).map((cell) => cell.trim().toLowerCase());
    if (wanted.every((name) => cells.includes(name))) return index;
  }
  return -1;
}

function columnIndex(header: string[], name: string): number {
  const wanted = name.toLowerCase();
  return header.findIndex((cell) => cell.trim().toLowerCase() === wanted);
}

function canonicalCategory(raw: string): string {
  const trimmed = raw.trim();
  const known = MGMT_EXPENSE_CATEGORIES.find(
    (category) => category.toLowerCase() === trimmed.toLowerCase(),
  );
  return known ?? trimmed;
}

export function loadLedgerCandidates(unitNumber: string): string[] {
  const digits = unitNumber.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "") || digits || unitNumber.trim();
  const padded = bare.padStart(2, "0");
  return [
    `Truck #${padded} Load Ledger`,
    `Truck #${bare} Load Ledger`,
    `Truck ${padded} Load Ledger`,
    "Load Ledger",
  ];
}

export function pickLoadLedgerTitle(titles: string[], unitNumber: string): string | null {
  const ledgers = titles.filter((title) => /load ledger/i.test(title));
  if (ledgers.length === 0) return null;
  const wanted = new Set(loadLedgerCandidates(unitNumber).map((title) => title.toLowerCase()));
  return ledgers.find((title) => wanted.has(title.trim().toLowerCase())) ?? ledgers[0] ?? null;
}

export function pickMgmtExpensesTitle(titles: string[]): string | null {
  return (
    titles.find((title) => /mgmt expenses/i.test(title)) ??
    titles.find((title) => /management expenses/i.test(title)) ??
    null
  );
}

export function insFromLoadLedger(
  grid: SheetGrid,
  weekStart: string,
  weekEnd: string,
): { insCents: number; loadCount: number } {
  const headerIndex = findHeader(grid, ["Delivery Date", "Load ID", "Rate"]);
  if (headerIndex < 0) return { insCents: 0, loadCount: 0 };
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, "Delivery Date");
  const loadCol = columnIndex(header, "Load ID");
  const rateCol = columnIndex(header, "Rate");
  let insCents = 0;
  let loadCount = 0;
  for (const row of grid.slice(headerIndex + 1)) {
    const loadId = (row[loadCol] ?? "").trim();
    if (!loadId) continue;
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    const cents = sheetAmountToCents(row[rateCol] ?? "");
    if (cents == null) continue;
    insCents += cents;
    loadCount += 1;
  }
  return { insCents, loadCount };
}

export function outsFromMgmtExpenses(
  grid: SheetGrid,
  weekStart: string,
  weekEnd: string,
): { outsCents: number; categories: ExpenseCategoryTotal[] } {
  const headerIndex = findHeader(grid, ["Date", "Category", "Amount"]);
  if (headerIndex < 0) return { outsCents: 0, categories: [] };
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, "Date");
  const categoryCol = columnIndex(header, "Category");
  const amountCol = columnIndex(header, "Amount");
  const totals = new Map<string, number>();
  for (const row of grid.slice(headerIndex + 1)) {
    const categoryRaw = (row[categoryCol] ?? "").trim();
    if (!categoryRaw || categoryRaw.toLowerCase() === "total") continue;
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    const cents = sheetAmountToCents(row[amountCol] ?? "");
    if (cents == null) continue;
    const category = canonicalCategory(categoryRaw);
    totals.set(category, (totals.get(category) ?? 0) + cents);
  }
  const categories = [...totals.entries()]
    .filter(([, cents]) => cents !== 0)
    .sort((a, b) => {
      const aOrder = CATEGORY_ORDER.get(a[0].toLowerCase()) ?? 100;
      const bOrder = CATEGORY_ORDER.get(b[0].toLowerCase()) ?? 100;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a[0].localeCompare(b[0]);
    })
    .map(([category, cents]) => ({ category, cents }));
  const outsCents = [...totals.values()].reduce((sum, cents) => sum + cents, 0);
  return { outsCents, categories };
}

export function buildTruckWeekInsOuts(input: {
  unitNumber: string;
  truckName: string;
  weekStart: string;
  weekEnd: string;
  loadLedger: SheetGrid | null;
  mgmtExpenses: SheetGrid | null;
  note: string | null;
}): TruckWeekInsOuts {
  const base = {
    unitNumber: input.unitNumber,
    truckName: input.truckName,
  };
  if (!input.loadLedger && !input.mgmtExpenses) {
    return {
      ...base,
      insCents: 0,
      outsCents: 0,
      netCents: 0,
      loadCount: 0,
      categories: [],
      note: input.note,
      readable: false,
    };
  }
  const ins = input.loadLedger
    ? insFromLoadLedger(input.loadLedger, input.weekStart, input.weekEnd)
    : { insCents: 0, loadCount: 0 };
  const outs = input.mgmtExpenses
    ? outsFromMgmtExpenses(input.mgmtExpenses, input.weekStart, input.weekEnd)
    : { outsCents: 0, categories: [] };
  return {
    ...base,
    insCents: ins.insCents,
    outsCents: outs.outsCents,
    netCents: ins.insCents - outs.outsCents,
    loadCount: ins.loadCount,
    categories: outs.categories,
    note: input.note,
    readable: true,
  };
}
