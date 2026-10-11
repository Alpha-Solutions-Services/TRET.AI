import { describe, expect, it } from "vitest";
import { buildManagementCards, tolsonPayableForTruck } from "./summary";

describe("management card totals", () => {
  it("sets Legacy income to the Legacy fees and Tolson payable to the lease fees", () => {
    const summary = buildManagementCards({
      expenseMonth: "2026-10",
      legacyFeeCents: 348_500,
      tolsonLeaseFeeCents: 210_400,
      operatingExpenses: [
        { expenseDate: "2026-09-30", amountCents: 10_000 },
        { expenseDate: "2026-10-02", amountCents: 4_000 },
        { expenseDate: "2026-10-20", amountCents: 1_500 },
        { expenseDate: "2026-11-01", amountCents: 9_000 },
      ],
    });
    expect(summary.incomeCents).toBe(348_500);
    expect(summary.tolsonPayableCents).toBe(210_400);
    expect(summary.legacyKeptCents).toBe(348_500);
    expect(summary.expenseCents).toBe(5_500);
    expect(summary.netCents).toBe(343_000);
    expect(summary.netCents).toBe(summary.incomeCents - summary.expenseCents);
  });

  it("still prices a percent of gross for a single truck", () => {
    expect(tolsonPayableForTruck({ type: null, value: null, grossCents: 700_000 })).toBe(0);
    expect(tolsonPayableForTruck({ type: "percent_of_gross", value: 800, grossCents: 250_000 })).toBe(20_000);
    expect(tolsonPayableForTruck({ type: "percent_of_gross", value: 1000, grossCents: 855_000 })).toBe(85_500);
  });
});
