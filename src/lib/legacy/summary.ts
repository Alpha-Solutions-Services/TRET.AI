import type { TruckClass } from "@/lib/fee-engine";
import { roundHalfUpDivide } from "@/lib/fee-engine";
import { monthBounds, parseMonth } from "@/lib/legacy/expenses";

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
  /** Five fifteenths of a third-party fee. Already included in income. */
  legacyKeptCents: number;
  expenseMonth: string;
};

/**
 * Own trucks: the management fee is the Tolson payable.
 * Third-party trucks: the fee splits ten fifteenths to Tolson and five fifteenths to Legacy.
 * Half-up to the cent. The two shares add back to the fee.
 */
export function splitManagementFee(
  feeCents: number,
  truckClass: TruckClass,
): { tolsonCents: number; legacyKeptCents: number } {
  if (!Number.isInteger(feeCents) || feeCents < 0) {
    throw new Error("Management fee must be zero or more cents");
  }
  if (truckClass === "legacy_owned") {
    return { tolsonCents: feeCents, legacyKeptCents: 0 };
  }
  const tolsonCents = roundHalfUpDivide(BigInt(feeCents) * BigInt(10), BigInt(15));
  return { tolsonCents, legacyKeptCents: feeCents - tolsonCents };
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
 * Net is income minus those expenses. Tolson payable is not subtracted again.
 */
export function buildManagementCards(input: {
  fees: Array<{ feeCents: number; truckClass: TruckClass }>;
  operatingExpenses: Array<{ expenseDate: string; amountCents: number }>;
  expenseMonth: string;
}): ManagementCardSummary {
  if (!parseMonth(input.expenseMonth)) {
    throw new Error("Expense month must be YYYY-MM");
  }
  let incomeCents = 0;
  let tolsonPayableCents = 0;
  let legacyKeptCents = 0;
  for (const fee of input.fees) {
    const split = splitManagementFee(fee.feeCents, fee.truckClass);
    incomeCents += fee.feeCents;
    tolsonPayableCents += split.tolsonCents;
    legacyKeptCents += split.legacyKeptCents;
  }
  const expenseCents = monthPortalExpenseCents(input.operatingExpenses, input.expenseMonth);
  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    tolsonPayableCents,
    legacyKeptCents,
    expenseMonth: input.expenseMonth,
  };
}
