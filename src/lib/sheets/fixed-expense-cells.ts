import { columnIndex, findHeaderRow } from "@/lib/sheets/cell";
import { findWeeklyExpenseRow } from "@/lib/sheets/weekly-expenses";
import type { FixedExpenseKind } from "@/lib/fixed-expenses/kinds";

export type SheetExpenseKind = FixedExpenseKind | "DISPATCH_FEE" | "FACTORING_FEE";

export const SHEET_EXPENSE_LINES: Array<{ kind: SheetExpenseKind; label: string; names: string[] }> = [
  { kind: "TRUCK_PAYMENTS", label: "Truck payments", names: ["truck pymts", "truck payments"] },
  { kind: "TRAILER_PAYMENTS", label: "Trailer payments", names: ["trailer pymts", "trailer payments"] },
  { kind: "INSURANCE", label: "Insurance", names: ["insurance"] },
  { kind: "ELD_FEE", label: "ELD fee", names: ["eld fee"] },
  { kind: "GPS_TRACKER", label: "GPS tracker", names: ["gps tracker"] },
  { kind: "YARD_FEE", label: "Yard fee", names: ["yard fee", "yard parking"] },
  { kind: "DISPATCH_FEE", label: "Dispatch fee", names: ["dispatch fee"] },
  { kind: "FACTORING_FEE", label: "Factoring fee", names: ["factoring fee"] },
  { kind: "MAINTENANCE_ESCROW_WEEKLY", label: "Maintenance Escrow Weekly", names: ["maintenance escrow weekly", "weekly escrow"] },
  { kind: "TOLL_PASS", label: "Toll pass", names: ["toll pass"] },
  { kind: "PERMITS", label: "Permit fees", names: ["permit fees", "permits"] },
  { kind: "MISC", label: "Misc", names: ["misc", "miscellaneous"] },
];

export function sheetExpenseLine(kind: string) {
  return SHEET_EXPENSE_LINES.find((line) => line.kind === kind) ?? null;
}

export function columnLetters(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function weeklyExpenseTab(unitNumber: string): string {
  const digits = unitNumber.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "") || digits || unitNumber.trim();
  return `Truck #${bare.padStart(2, "0")} Weekly Expenses`;
}

/** A1 of the Weekly Expenses cell for this Monday and column, when the grid has that row. */
export function locateWeeklyExpenseCell(
  grid: string[][],
  weekStart: string,
  weekEnd: string,
  names: readonly string[],
): { a1: string; header: string } | null {
  const found = findWeeklyExpenseRow(grid, weekStart, weekEnd);
  if (!found) return null;
  const column = columnIndex(found.header, [...names]);
  if (column < 0) return null;
  const headerIndex = findHeaderRow(grid, [["week start date", "date"], ["driver compensation"]]);
  const rowIndex = grid.indexOf(found.row);
  if (headerIndex < 0 || rowIndex < 0) return null;
  return {
    a1: `${columnLetters(column)}${rowIndex + 1}`,
    header: found.header[column] ?? names[0] ?? "",
  };
}
