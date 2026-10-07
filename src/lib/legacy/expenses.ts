import { MGMT_EXPENSE_CATEGORIES } from "@/lib/sheets/ins-outs";

/** Categories on the truck sheet dropdown, used for portal monthly Legacy expenses. */
export const LEGACY_COMPANY_CATEGORIES = MGMT_EXPENSE_CATEGORIES;

export function canonicalLegacyCategory(raw: string): string | null {
  const trimmed = raw.trim();
  return (
    LEGACY_COMPANY_CATEGORIES.find((category) => category.toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

export function parseMonth(raw: string | undefined | null): string | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const month = Number(raw.slice(5, 7));
  if (month < 1 || month > 12) return null;
  return raw;
}

export function currentMonthUtc(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function monthBounds(month: string): { start: string; endExclusive: string } {
  const parsed = parseMonth(month);
  if (!parsed) throw new Error("Month must be YYYY-MM");
  const year = Number(parsed.slice(0, 4));
  const mon = Number(parsed.slice(5, 7));
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  return {
    start: `${parsed}-01`,
    endExclusive: `${String(nextYear).padStart(4, "0")}-${String(nextMon).padStart(2, "0")}-01`,
  };
}

export function expenseTotalCents(rows: Array<{ amount_cents: number }>): number {
  return rows.reduce((sum, row) => sum + row.amount_cents, 0);
}

export type ExpenseMonthPoint = { month: string; cents: number };
export type ExpenseSlice = { label: string; cents: number };

export function expensesByMonth(
  rows: Array<{ expenseDate: string; amountCents: number }>,
): ExpenseMonthPoint[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const month = row.expenseDate.slice(0, 7);
    if (!parseMonth(month)) continue;
    totals.set(month, (totals.get(month) ?? 0) + row.amountCents);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, cents]) => ({ month, cents }));
}

export function expensesByCategory(
  rows: Array<{ expenseDate: string; category: string; amountCents: number }>,
  month: string,
): ExpenseSlice[] {
  const bounds = monthBounds(month);
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.expenseDate < bounds.start || row.expenseDate >= bounds.endExclusive) continue;
    const label = canonicalLegacyCategory(row.category) ?? row.category;
    totals.set(label, (totals.get(label) ?? 0) + row.amountCents);
  }
  return [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, cents]) => ({ label, cents }));
}
