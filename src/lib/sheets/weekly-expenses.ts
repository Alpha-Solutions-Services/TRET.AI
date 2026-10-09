import {
  columnIndex,
  columnIndexes,
  findHeaderRow,
  inWeek,
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
 * Truck payments and trailer payments are included here.
 * The asset report PDF leaves those two lines off.
 * "Moved to Management" is left out.
 */
export const WEEKLY_EXPENSE_LINES = [
  { label: "Driver compensation", names: ["driver compensation"] },
  { label: "Management fee", names: ["management fee"] },
  { label: "Truck payments", names: ["truck pymts", "truck payments"] },
  { label: "Trailer payments", names: ["trailer pymts", "trailer payments"] },
  { label: "Dispatch fee", names: ["dispatch fee"] },
  { label: "Factoring fee", names: ["factoring fee"] },
  { label: "Fuel", names: ["fuel"] },
  { label: "Insurance", names: ["insurance"] },
  { label: "Maintenance Escrow Weekly", names: ["maintenance escrow weekly", "weekly escrow", "escrow balance"] },
  { label: "ELD fee", names: ["eld fee"] },
  { label: "Yard fee", names: ["yard fee", "yard parking"] },
  { label: "GPS tracker", names: ["gps tracker"] },
  { label: "Toll pass", names: ["toll pass"] },
  { label: "Toll fees", names: ["toll fees", "toll charges"] },
  { label: "Permit fees", names: ["permit fees", "permits"] },
  { label: "Misc", names: ["misc", "miscellaneous", "receipts", "receipt"] },
] as const;

export const WEEKLY_EXPENSE_LABELS = WEEKLY_EXPENSE_LINES.map((line) => line.label);

const WEEKLY_LABEL_SET = new Set<string>(WEEKLY_EXPENSE_LABELS);

export function isWeeklyExpenseLabel(label: string): boolean {
  return WEEKLY_LABEL_SET.has(label);
}

export type WeeklyExpenseOuts = {
  outsCents: number;
  categories: ExpenseCategoryTotal[];
  headerFound: boolean;
  rowFound: boolean;
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

function lineCents(header: string[], row: string[], names: readonly string[]): number {
  return columnIndexes(header, names).reduce(
    (sum, index) => sum + (sheetAmountToCents(row[index] ?? "") ?? 0),
    0,
  );
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
    return { outsCents: 0, categories: [], headerFound: false, rowFound: false };
  }
  const found = findWeeklyExpenseRow(grid, weekStart, weekEnd);
  if (!found) {
    return { outsCents: 0, categories: [], headerFound: true, rowFound: false };
  }
  const categories: ExpenseCategoryTotal[] = [];
  let outsCents = 0;
  for (const line of WEEKLY_EXPENSE_LINES) {
    const cents = lineCents(found.header, found.row, line.names);
    if (cents === 0) continue;
    categories.push({ category: line.label, cents });
    outsCents += cents;
  }
  const receipts = receiptRows(grid, weekStart, weekEnd, found.row);
  for (const line of receipts) {
    categories.push(line);
    outsCents += line.cents;
  }
  return { outsCents, categories, headerFound: true, rowFound: true };
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
    const labelCell = row.find((cell) => /tarp|receipt|7-eleven|7 eleven|love'?s|misc/i.test(cell));
    if (!labelCell) continue;
    const cents = row.map((cell) => sheetAmountToCents(cell)).find((value) => value != null && value > 0);
    if (cents == null) continue;
    const label = labelCell.replace(/\s+/g, " ").trim();
    totals.set(label, (totals.get(label) ?? 0) + cents);
  }
  return [...totals.entries()].map(([category, cents]) => ({ category, cents }));
}
