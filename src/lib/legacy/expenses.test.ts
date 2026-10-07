import { describe, expect, it } from "vitest";
import {
  canonicalLegacyCategory,
  currentMonthUtc,
  expenseTotalCents,
  expensesByCategory,
  expensesByMonth,
  monthBounds,
  parseMonth,
} from "./expenses";

describe("legacy company expenses", () => {
  it("accepts the sheet category names", () => {
    expect(canonicalLegacyCategory("vektor fee")).toBe("Vektor Fee");
    expect(canonicalLegacyCategory("Spare Expense 5")).toBe("Spare Expense 5");
    for (const name of [
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
    ]) {
      expect(canonicalLegacyCategory(name.toLowerCase())).toBe(name);
    }
    expect(canonicalLegacyCategory("Office rent")).toBeNull();
  });

  it("bounds a month and totals cents", () => {
    expect(parseMonth("2026-10")).toBe("2026-10");
    expect(parseMonth("2026-13")).toBeNull();
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
    expect(currentMonthUtc(new Date("2026-10-07T23:00:00Z"))).toBe("2026-10");
    expect(expenseTotalCents([{ amount_cents: 3000 }, { amount_cents: 250 }])).toBe(3250);
  });

  it("groups portal expenses by month and category", () => {
    const rows = [
      { expenseDate: "2026-09-21", category: "Vektor Fee", amountCents: 1000 },
      { expenseDate: "2026-10-02", category: "Sintra AI", amountCents: 2500 },
      { expenseDate: "2026-10-18", category: "Sintra AI", amountCents: 500 },
    ];
    expect(expensesByMonth(rows)).toEqual([
      { month: "2026-09", cents: 1000 },
      { month: "2026-10", cents: 3000 },
    ]);
    expect(expensesByCategory(rows, "2026-10")).toEqual([{ label: "Sintra AI", cents: 3000 }]);
  });
});
