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
  { label: "Maintenance escrow", names: ["maintenance escrow weekly", "weekly escrow"] },
  { label: "ELD fee", names: ["eld fee"] },
  { label: "Yard fee", names: ["yard fee", "yard parking"] },
  { label: "GPS tracker", names: ["gps tracker"] },
  { label: "Toll pass", names: ["toll pass"] },
  { label: "Toll fees", names: ["toll fees", "toll charges"] },
  { label: "Permit fees", names: ["permit fees", "permits"] },
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
  return { outsCents, categories, headerFound: true, rowFound: true };
}
