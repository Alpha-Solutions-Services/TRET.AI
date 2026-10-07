import { assertMonday, weekBoundsForDate } from "@/lib/fee-engine";
import { assertInteger, assertNonNegativeInteger } from "@/lib/fee-engine/money";
import type { UnitStatement } from "@/lib/statements/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A management operating expense. Only the date and cents are used. */
export type PnlOperatingExpense = {
  expenseDate: string;
  amountCents: number;
};

export type ManagementPnl = {
  weekStart: string;
  weekEnd: string;
  /** Legacy retained on managed trucks only. The rate comes from the statement, not from code. */
  legacyRetainedCents: number;
  /** Dispatch fee Legacy keeps, on its own line. Owned and managed trucks both count. */
  dispatchFeeCents: number;
  incomeCents: number;
  /** Fixed weekly expenses charged to management. */
  fixedManagementCents: number;
  /** Operating expenses whose date falls in this Monday–Sunday week. */
  operatingExpenseCents: number;
  expenseCents: number;
  netCents: number;
  /** Tolson payable for the week. Shown beside the P&L and not included in net. */
  tolsonPayableCents: number;
};

/**
 * Management-company P&L for one week.
 * Income is Legacy retained on third-party trucks plus the dispatch fee.
 * Expenses are fixed costs charged to management plus operating expenses dated in the week.
 */
export function buildManagementPnl(input: {
  weekStart: string;
  units: UnitStatement[];
  operatingExpenses: PnlOperatingExpense[];
}): ManagementPnl {
  assertMonday(input.weekStart, "Week start");
  const bounds = weekBoundsForDate(input.weekStart);

  let legacyRetainedCents = 0;
  let dispatchFeeCents = 0;
  let fixedManagementCents = 0;
  let tolsonPayableCents = 0;

  for (const unit of input.units) {
    assertNonNegativeInteger(unit.legacyRetainedCents, `legacy retained ${unit.unitNumber}`);
    assertNonNegativeInteger(unit.dispatchFeeCents, `dispatch ${unit.unitNumber}`);
    assertNonNegativeInteger(unit.fixedManagementCents, `fixed management ${unit.unitNumber}`);
    assertNonNegativeInteger(unit.tolsonPayableCents, `Tolson ${unit.unitNumber}`);
    if (unit.truckClass === "third_party") {
      legacyRetainedCents += unit.legacyRetainedCents;
    }
    dispatchFeeCents += unit.dispatchFeeCents;
    fixedManagementCents += unit.fixedManagementCents;
    tolsonPayableCents += unit.tolsonPayableCents;
  }

  let operatingExpenseCents = 0;
  for (const expense of input.operatingExpenses) {
    assertNonNegativeInteger(expense.amountCents, "operating expense");
    if (!ISO_DATE.test(expense.expenseDate)) {
      throw new Error("Operating expense date must be YYYY-MM-DD");
    }
    if (expense.expenseDate < bounds.start || expense.expenseDate > bounds.end) continue;
    operatingExpenseCents += expense.amountCents;
  }

  const incomeCents = legacyRetainedCents + dispatchFeeCents;
  const expenseCents = fixedManagementCents + operatingExpenseCents;
  const netCents = incomeCents - expenseCents;
  assertNonNegativeInteger(legacyRetainedCents, "legacy retained");
  assertNonNegativeInteger(dispatchFeeCents, "dispatch");
  assertNonNegativeInteger(incomeCents, "income");
  assertNonNegativeInteger(fixedManagementCents, "fixed management");
  assertNonNegativeInteger(operatingExpenseCents, "operating expenses");
  assertNonNegativeInteger(expenseCents, "expenses");
  assertInteger(netCents, "management net");
  assertNonNegativeInteger(tolsonPayableCents, "Tolson payable");

  return {
    weekStart: bounds.start,
    weekEnd: bounds.end,
    legacyRetainedCents,
    dispatchFeeCents,
    incomeCents,
    fixedManagementCents,
    operatingExpenseCents,
    expenseCents,
    netCents,
    tolsonPayableCents,
  };
}
