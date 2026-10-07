import { roundHalfUpDivide } from "@/lib/fee-engine";
import { monthBounds, parseMonth } from "@/lib/legacy/expenses";
import type { TolsonPayableType } from "@/lib/trucks/tolson";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type ManagementCardSummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  tolsonPayableCents: number;
  /** Income minus Tolson payable. Portal expenses are not in this figure. */
  legacyKeptCents: number;
  expenseMonth: string;
};

export type TruckTolsonInput = {
  type: TolsonPayableType | null;
  /** Basis points for percent of gross. Cents for a fixed weekly amount. */
  value: number | null;
  grossCents: number;
};

/** Blank type or value is $0. Percent uses this truck's week gross. Fixed is once per week. */
export function tolsonPayableForTruck(input: TruckTolsonInput): number {
  if (input.type == null || input.value == null) return 0;
  if (!Number.isInteger(input.value) || input.value < 0) {
    throw new Error("Tolson payable value must be zero or more");
  }
  if (!Number.isInteger(input.grossCents) || input.grossCents < 0) {
    throw new Error("Gross must be zero or more cents");
  }
  if (input.type === "percent_of_gross") {
    if (input.value > 10000) throw new Error("Tolson percent must be from 0 to 100");
    return Number(roundHalfUpDivide(BigInt(input.grossCents) * BigInt(input.value), BigInt(10000)));
  }
  if (input.type === "fixed_weekly") return input.value;
  throw new Error("Tolson payable type is not recognized");
}

export function expenseMonthLabel(month: string): string {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  const name = MONTH_NAMES[Number(parsed.slice(5, 7)) - 1] ?? parsed;
  return `${name} ${parsed.slice(0, 4)}`;
}

/** Portal costs whose date falls in the expense month. The full month, not a week slice. */
export function monthPortalExpenseCents(
  rows: Array<{ expenseDate: string; amountCents: number }>,
  month: string,
): number {
  const bounds = monthBounds(month);
  let total = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.amountCents) || row.amountCents < 0) {
      throw new Error("Portal expense must be zero or more cents");
    }
    if (row.expenseDate < bounds.start || row.expenseDate >= bounds.endExclusive) continue;
    total += row.amountCents;
  }
  return total;
}

/**
 * Management cards for one week.
 * Income is the summed management fee on sheet loads.
 * Expenses are portal costs for the week's expense month.
 * Tolson payable is the sum of each truck setting and is its own expense.
 * Net is income minus portal expenses minus Tolson payable.
 * Legacy kept is income minus Tolson payable.
 */
export function buildManagementCards(input: {
  fees: Array<{ feeCents: number }>;
  tolson: TruckTolsonInput[];
  operatingExpenses: Array<{ expenseDate: string; amountCents: number }>;
  expenseMonth: string;
}): ManagementCardSummary {
  if (!parseMonth(input.expenseMonth)) {
    throw new Error("Expense month must be YYYY-MM");
  }
  let incomeCents = 0;
  for (const fee of input.fees) {
    if (!Number.isInteger(fee.feeCents) || fee.feeCents < 0) {
      throw new Error("Management fee must be zero or more cents");
    }
    incomeCents += fee.feeCents;
  }
  let tolsonPayableCents = 0;
  for (const row of input.tolson) {
    tolsonPayableCents += tolsonPayableForTruck(row);
  }
  const expenseCents = monthPortalExpenseCents(input.operatingExpenses, input.expenseMonth);
  const legacyKeptCents = incomeCents - tolsonPayableCents;
  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents - tolsonPayableCents,
    tolsonPayableCents,
    legacyKeptCents,
    expenseMonth: input.expenseMonth,
  };
}
