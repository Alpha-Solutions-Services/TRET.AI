import { inWeek, sheetAmountToCents, sheetDay } from "@/lib/sheets/cell";
import { parseLoadLedger } from "@/lib/sheets/ledger";

export { sheetAmountToCents, sheetDay } from "@/lib/sheets/cell";

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
  /** Easy-language cause when the sheet could not be read, a tab was missing, or a header did not parse. */
  note: string | null;
  /** Technical cause. Click copies this. Null when the note is already the full cause. */
  noteDetail: string | null;
  readable: boolean;
  /** Load ledger rows in this week. Rate is null when the cell was blank. */
  ledgerLoads: Array<{ loadId: string; rateCents: number | null }>;
};

const CATEGORY_ORDER = new Map<string, number>(
  MGMT_EXPENSE_CATEGORIES.map((category, index) => [category.toLowerCase(), index]),
);

function findHeader(grid: SheetGrid, required: string[]): number {
  const wanted = required.map((name) => name.toLowerCase());
  for (let index = 0; index < grid.length; index++) {
    const cells = (grid[index] ?? []).map((cell) => cell.trim().toLowerCase().replace(/\s+/g, " "));
    if (wanted.every((name) => cells.includes(name))) return index;
  }
  return -1;
}

function columnIndex(header: string[], name: string): number {
  const wanted = name.toLowerCase();
  return header.findIndex((cell) => cell.trim().toLowerCase().replace(/\s+/g, " ") === wanted);
}

function canonicalCategory(raw: string): string {
  const trimmed = raw.trim();
  const known = MGMT_EXPENSE_CATEGORIES.find(
    (category) => category.toLowerCase() === trimmed.toLowerCase(),
  );
  return known ?? trimmed;
}

function unitForms(unitNumber: string): string[] {
  const digits = unitNumber.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "") || digits;
  if (!bare) return [];
  return [...new Set([bare, bare.padStart(2, "0")])];
}

function titleMatchesUnit(title: string, unitNumber: string): boolean {
  return unitForms(unitNumber).some((form) =>
    new RegExp(`(?:^|[^0-9])${form}(?:[^0-9]|$)`).test(title),
  );
}

export function loadLedgerCandidates(unitNumber: string): string[] {
  const digits = unitNumber.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "") || digits || unitNumber.trim();
  const padded = bare.padStart(2, "0");
  return [
    ...new Set([
      `Truck #${padded} Load Ledger`,
      `Truck #${bare} Load Ledger`,
      `Truck ${padded} Load Ledger`,
      `Truck ${bare} Load Ledger`,
      `Unit ${padded} Load Ledger`,
      `Unit ${bare} Load Ledger`,
      "Load Ledger",
    ]),
  ];
}

export function pickLoadLedgerTitle(titles: string[], unitNumber: string): string | null {
  const ledgers = titles.filter((title) => /load ledger/i.test(title));
  if (ledgers.length === 0) return null;
  const wanted = new Set(loadLedgerCandidates(unitNumber).map((title) => title.toLowerCase()));
  const exact = ledgers.find((title) => wanted.has(title.trim().toLowerCase()));
  if (exact) return exact;
  const matched = ledgers.filter((title) => titleMatchesUnit(title, unitNumber));
  if (matched.length > 0) return matched[0] ?? null;
  if (ledgers.length === 1) return ledgers[0] ?? null;
  return null;
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
): {
  insCents: number;
  loadCount: number;
  headerFound: boolean;
  loads: Array<{ loadId: string; rateCents: number | null }>;
} {
  const parsed = parseLoadLedger(grid);
  if (!parsed.headerFound) return { insCents: 0, loadCount: 0, headerFound: false, loads: [] };
  let insCents = 0;
  let loadCount = 0;
  const loads: Array<{ loadId: string; rateCents: number | null }> = [];
  for (const row of parsed.rows) {
    if (!inWeek(row.deliveryDay, weekStart, weekEnd)) continue;
    loads.push({ loadId: row.loadId, rateCents: row.rateCents });
    if (row.rateCents == null) continue;
    insCents += row.rateCents;
    loadCount += 1;
  }
  return { insCents, loadCount, headerFound: true, loads };
}

export function outsFromMgmtExpenses(
  grid: SheetGrid,
  weekStart: string,
  weekEnd: string,
): { outsCents: number; categories: ExpenseCategoryTotal[]; headerFound: boolean } {
  const headerIndex = findHeader(grid, ["Date", "Category", "Amount"]);
  if (headerIndex < 0) return { outsCents: 0, categories: [], headerFound: false };
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
  return { outsCents, categories, headerFound: true };
}

export function fleetInsOutsTotals(rows: TruckWeekInsOuts[]): {
  loadCount: number;
  insCents: number;
  outsCents: number;
  netCents: number;
  categories: ExpenseCategoryTotal[];
  readableCount: number;
} {
  const totals = new Map<string, number>();
  let insCents = 0;
  let outsCents = 0;
  let loadCount = 0;
  let readableCount = 0;
  for (const row of rows) {
    if (!row.readable) continue;
    readableCount += 1;
    insCents += row.insCents;
    outsCents += row.outsCents;
    loadCount += row.loadCount;
    for (const category of row.categories) {
      totals.set(category.category, (totals.get(category.category) ?? 0) + category.cents);
    }
  }
  const categories: ExpenseCategoryTotal[] = MGMT_EXPENSE_CATEGORIES.map((category) => ({
    category,
    cents: totals.get(category) ?? 0,
  }));
  for (const [category, cents] of totals) {
    if (categories.some((row) => row.category === category)) continue;
    categories.push({ category, cents });
  }
  return {
    loadCount,
    insCents,
    outsCents,
    netCents: insCents - outsCents,
    categories,
    readableCount,
  };
}

export function buildTruckWeekInsOuts(input: {
  unitNumber: string;
  truckName: string;
  weekStart: string;
  weekEnd: string;
  loadLedger: SheetGrid | null;
  mgmtExpenses: SheetGrid | null;
  note: string | null;
  noteDetail?: string | null;
}): TruckWeekInsOuts {
  const noteDetail = input.noteDetail ?? null;
  const base = {
    unitNumber: input.unitNumber,
    truckName: input.truckName,
  };
  const empty = {
    ...base,
    insCents: 0,
    outsCents: 0,
    netCents: 0,
    loadCount: 0,
    categories: [] as ExpenseCategoryTotal[],
    ledgerLoads: [] as Array<{ loadId: string; rateCents: number | null }>,
    noteDetail,
  };
  if (!input.loadLedger && !input.mgmtExpenses) {
    return { ...empty, note: input.note, readable: false };
  }
  const ins = input.loadLedger
    ? insFromLoadLedger(input.loadLedger, input.weekStart, input.weekEnd)
    : null;
  const outs = input.mgmtExpenses
    ? outsFromMgmtExpenses(input.mgmtExpenses, input.weekStart, input.weekEnd)
    : null;
  const notes: string[] = [];
  if (input.note) notes.push(input.note);
  if (ins && !ins.headerFound) {
    notes.push("Load Ledger was opened but the header row was not found. Expected Delivery Date, Load ID, and Rate.");
  }
  if (outs && !outs.headerFound) {
    notes.push("Mgmt Expenses was opened but the header row was not found. Expected Date, Category, and Amount.");
  }
  const parsed = Boolean(ins?.headerFound || outs?.headerFound);
  if (!parsed) {
    return {
      ...empty,
      note: notes.join(" ") || "Sheet was not read.",
      readable: false,
    };
  }
  return {
    ...base,
    insCents: ins?.insCents ?? 0,
    outsCents: outs?.outsCents ?? 0,
    netCents: (ins?.insCents ?? 0) - (outs?.outsCents ?? 0),
    loadCount: ins?.loadCount ?? 0,
    categories: outs?.categories ?? [],
    ledgerLoads: ins?.loads ?? [],
    note: notes.length ? notes.join(" ") : null,
    noteDetail,
    readable: true,
  };
}
