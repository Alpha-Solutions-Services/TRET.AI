import {
  columnIndex,
  columnIndexes,
  findHeaderRow,
  inWeek,
  isEmptyCell,
  sheetAmountToCents,
  sheetDay,
} from "@/lib/sheets/cell";

type SheetGrid = string[][];

type ExpenseCategoryTotal = {
  category: string;
  cents: number;
};

/**
 * Weekly Expenses columns for dashboard Outs.
 * Truck payments and trailer payments are included here and on the owner PDF.
 * "Moved to Management" is left out.
 */
export const WEEKLY_EXPENSE_LINES = [
  { label: "Driver compensation", names: ["driver compensation"] },
  { label: "Management fee", names: ["management fee", "total fees (legacy+tolson)", "total fees (legacy + tolson)"] },
  { label: "Truck payments", names: ["truck pymts", "truck payments"] },
  { label: "Trailer payments", names: ["trailer pymts", "trailer payments"] },
  { label: "Dispatch fee", names: ["dispatch fee"] },
  { label: "Factoring fee", names: ["factoring fee"] },
  { label: "Fuel", names: ["fuel"] },
  { label: "Insurance", names: ["insurance"] },
  { label: "Maintenance Escrow Weekly", names: ["maintenance escrow weekly", "weekly escrow"] },
  { label: "ELD fee", names: ["eld fee"] },
  { label: "Yard fee", names: ["yard fee", "yard parking"] },
  { label: "GPS tracker", names: ["gps tracker"] },
  { label: "Toll pass", names: ["toll pass"] },
  { label: "Toll fees", names: ["toll fees", "toll charges"] },
  { label: "Permit fees", names: ["permit fees", "permits"] },
  { label: "Misc", names: ["misc", "miscellaneous", "receipts", "receipt"] },
  { label: "Other (manual)", names: ["other (manual)", "other manual"] },
] as const;

export const WEEKLY_EXPENSE_LABELS = WEEKLY_EXPENSE_LINES.map((line) => line.label);

const WEEKLY_LABEL_SET = new Set<string>(WEEKLY_EXPENSE_LABELS);

export function isWeeklyExpenseLabel(label: string): boolean {
  return WEEKLY_LABEL_SET.has(label);
}

/** Misc column plus receipt rows that are not a standard weekly line. */
export function statementMiscCents(categories: readonly ExpenseCategoryTotal[]): number {
  let total = 0;
  for (const row of categories) {
    if (row.category === "Misc" || !isWeeklyExpenseLabel(row.category)) total += row.cents;
  }
  return total;
}

export type WeeklyExpenseOuts = {
  outsCents: number;
  categories: ExpenseCategoryTotal[];
  headerFound: boolean;
  rowFound: boolean;
  /** Column AN. Null when that header is absent. Not added on top of column H. */
  legacyFeeCents: number | null;
  /** Column AO. Null when that header is absent. Not added on top of column H. */
  tolsonFeeCents: number | null;
  /** Filled cells that could not be read, or that are over the cap. They are not counted as $0. */
  warnings: string[];
};

export function weeklyExpensesCandidates(unitNumber: string): string[] {
  const digits = unitNumber.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "") || digits || unitNumber.trim();
  const padded = bare.padStart(2, "0");
  return [
    ...new Set([
      `Truck #${padded} Weekly Expenses`,
      `Truck #${bare} Weekly Expenses`,
      `Truck ${padded} Weekly Expenses`,
      `Truck ${bare} Weekly Expenses`,
      "Weekly Expenses",
    ]),
  ];
}

function lineRead(
  header: string[],
  row: string[],
  label: string,
  names: readonly string[],
): { cents: number; warnings: string[] } {
  const warnings: string[] = [];
  let cents = 0;
  for (const index of columnIndexes(header, names)) {
    const raw = row[index] ?? "";
    if (isEmptyCell(raw)) continue;
    const value = sheetAmountToCents(raw);
    if (value == null) {
      warnings.push(
        `Weekly Expenses ${label} is filled but could not be read or is over the cap, so it was not counted as $0.`,
      );
      continue;
    }
    cents += value;
  }
  return { cents, warnings };
}

/** Null when the header is missing or a filled cell could not be read. Zero is a real cell. */
function optionalLineCents(
  header: string[],
  row: string[],
  label: string,
  names: readonly string[],
): { cents: number | null; warnings: string[] } {
  if (columnIndexes(header, names).length === 0) return { cents: null, warnings: [] };
  const read = lineRead(header, row, label, names);
  if (read.warnings.length > 0) return { cents: null, warnings: read.warnings };
  return { cents: read.cents, warnings: [] };
}

/** The Weekly Expenses row for this Monday, or another row dated inside the week. */
export function findWeeklyExpenseRow(
  grid: SheetGrid,
  weekStart: string,
  weekEnd: string,
): { header: string[]; row: string[] } | null {
  const headerIndex = findHeaderRow(grid, [["week start date", "date"], ["driver compensation"]]);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, ["week start date", "date"]);
  let fallback: string[] | null = null;
  for (const row of grid.slice(headerIndex + 1)) {
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    if (day === weekStart) return { header, row };
    fallback ??= row;
  }
  return fallback ? { header, row: fallback } : null;
}

export function outsFromWeeklyExpenses(
  grid: SheetGrid,
  weekStart: string,
  weekEnd: string,
): WeeklyExpenseOuts {
  const headerIndex = findHeaderRow(grid, [["week start date", "date"], ["driver compensation"]]);
  if (headerIndex < 0) {
    return { outsCents: 0, categories: [], headerFound: false, rowFound: false, legacyFeeCents: null, tolsonFeeCents: null, warnings: [] };
  }
  const found = findWeeklyExpenseRow(grid, weekStart, weekEnd);
  if (!found) {
    return { outsCents: 0, categories: [], headerFound: true, rowFound: false, legacyFeeCents: null, tolsonFeeCents: null, warnings: [] };
  }
  const categories: ExpenseCategoryTotal[] = [];
  const warnings: string[] = [];
  let outsCents = 0;
  for (const line of WEEKLY_EXPENSE_LINES) {
    const read = lineRead(found.header, found.row, line.label, line.names);
    warnings.push(...read.warnings);
    if (read.cents === 0) continue;
    categories.push({ category: line.label, cents: read.cents });
    outsCents += read.cents;
  }
  const receipts = receiptRows(grid, weekStart, weekEnd, found.row);
  for (const line of receipts) {
    categories.push(line);
    outsCents += line.cents;
  }
  const legacy = optionalLineCents(found.header, found.row, "Legacy Fee", ["legacy fee"]);
  const tolson = optionalLineCents(found.header, found.row, "Tolson Fee", ["tolson fee"]);
  warnings.push(...legacy.warnings, ...tolson.warnings);
  return {
    outsCents,
    categories,
    headerFound: true,
    rowFound: true,
    legacyFeeCents: legacy.cents,
    tolsonFeeCents: tolson.cents,
    warnings,
  };
}

/** Extra Misc or receipt rows under the weekly summary. The summary row itself is not counted twice. */
function receiptRows(
  grid: SheetGrid,
  weekStart: string,
  weekEnd: string,
  summary: string[],
): ExpenseCategoryTotal[] {
  const totals = new Map<string, number>();
  for (let index = 0; index < grid.length; index += 1) {
    const row = grid[index] ?? [];
    if (row === summary) continue;
    const header = row.map((cell) => cell.trim().toLowerCase());
    if (header.includes("date") && (header.includes("amount") || header.includes("cost"))) continue;
    const day = row.map((cell) => sheetDay(cell)).find((value) => value && inWeek(value, weekStart, weekEnd));
    if (!day) continue;
    const labelCell = row.find((cell) =>
      /tarp|receipt|7-eleven|7 eleven|love'?s|misc|ford|uber|repair/i.test(cell),
    );
    if (!labelCell) continue;
    const cents = row.map((cell) => sheetAmountToCents(cell)).find((value) => value != null && value > 0);
    if (cents == null) continue;
    const label = labelCell.replace(/\s+/g, " ").trim();
    totals.set(label, (totals.get(label) ?? 0) + cents);
  }
  return [...totals.entries()].map(([category, cents]) => ({ category, cents }));
}
