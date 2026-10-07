import { describe, expect, it } from "vitest";
import { buildManagementCards, tolsonPayableForTruck } from "./summary";

describe("management card totals", () => {
  it("sets income to the summed sheet fees for the week of 2026-10-05", () => {
    const summary = buildManagementCards({
      expenseMonth: "2026-10",
      fees: [
        { feeCents: 59_500 },
        { feeCents: 25_000 },
        { feeCents: 86_000 },
        { feeCents: 53_000 },
        { feeCents: 36_000 },
        { feeCents: 70_000 },
      ],
      tolson: [],
      operatingExpenses: [
        { expenseDate: "2026-09-30", amountCents: 10_000 },
        { expenseDate: "2026-10-02", amountCents: 4_000 },
        { expenseDate: "2026-10-20", amountCents: 1_500 },
        { expenseDate: "2026-11-01", amountCents: 9_000 },
      ],
    });
    expect(summary.incomeCents).toBe(329_500);
    expect(summary.tolsonPayableCents).toBe(0);
    expect(summary.legacyKeptCents).toBe(329_500);
    expect(summary.expenseCents).toBe(5_500);
    expect(summary.netCents).toBe(324_000);
    expect(summary.netCents).toBe(summary.incomeCents - summary.expenseCents - summary.tolsonPayableCents);
    expect(summary.legacyKeptCents).toBe(summary.incomeCents - summary.tolsonPayableCents);
  });

  it("sums each truck Tolson setting and subtracts it from net", () => {
    expect(
      tolsonPayableForTruck({ type: null, value: null, grossCents: 700_000 }),
    ).toBe(0);
    expect(
      tolsonPayableForTruck({ type: "percent_of_gross", value: null, grossCents: 700_000 }),
    ).toBe(0);
    expect(
      tolsonPayableForTruck({ type: "percent_of_gross", value: 1000, grossCents: 700_000 }),
    ).toBe(70_000);
    expect(
      tolsonPayableForTruck({ type: "fixed_weekly", value: 2_500, grossCents: 0 }),
    ).toBe(2_500);

    const summary = buildManagementCards({
      expenseMonth: "2026-10",
      fees: [{ feeCents: 100_000 }, { feeCents: 150_000 }],
      tolson: [
        { type: "percent_of_gross", value: 1000, grossCents: 1_000_000 },
        { type: null, value: null, grossCents: 500_000 },
        { type: "fixed_weekly", value: 2_500, grossCents: 0 },
      ],
      operatingExpenses: [{ expenseDate: "2026-10-02", amountCents: 4_000 }],
    });
    expect(summary.incomeCents).toBe(250_000);
    expect(summary.tolsonPayableCents).toBe(102_500);
    expect(summary.legacyKeptCents).toBe(147_500);
    expect(summary.expenseCents).toBe(4_000);
    expect(summary.netCents).toBe(143_500);
    expect(summary.netCents).toBe(summary.incomeCents - summary.expenseCents - summary.tolsonPayableCents);
  });
});
