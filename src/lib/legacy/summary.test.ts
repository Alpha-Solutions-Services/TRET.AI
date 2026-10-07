import { describe, expect, it } from "vitest";
import { buildManagementCards, splitManagementFee } from "./summary";

describe("management card totals", () => {
  it("sets income to the summed sheet fees for the week of 2026-10-05", () => {
    const summary = buildManagementCards({
      expenseMonth: "2026-10",
      fees: [
        { feeCents: 59_500, truckClass: "legacy_owned" },
        { feeCents: 25_000, truckClass: "legacy_owned" },
        { feeCents: 86_000, truckClass: "legacy_owned" },
        { feeCents: 53_000, truckClass: "legacy_owned" },
        { feeCents: 36_000, truckClass: "legacy_owned" },
        { feeCents: 70_000, truckClass: "legacy_owned" },
      ],
      operatingExpenses: [
        { expenseDate: "2026-09-30", amountCents: 10_000 },
        { expenseDate: "2026-10-02", amountCents: 4_000 },
        { expenseDate: "2026-10-20", amountCents: 1_500 },
        { expenseDate: "2026-11-01", amountCents: 9_000 },
      ],
    });
    expect(summary.incomeCents).toBe(329_500);
    expect(summary.tolsonPayableCents).toBe(329_500);
    expect(summary.legacyKeptCents).toBe(0);
    expect(summary.expenseCents).toBe(5_500);
    expect(summary.netCents).toBe(324_000);
    expect(summary.netCents).toBe(summary.incomeCents - summary.expenseCents);
    expect(summary.netCents).not.toBe(summary.incomeCents - summary.expenseCents - summary.tolsonPayableCents);
  });

  it("splits a third-party fee ten fifteenths to Tolson and five fifteenths to Legacy", () => {
    expect(splitManagementFee(150_000, "third_party")).toEqual({
      tolsonCents: 100_000,
      legacyKeptCents: 50_000,
    });
    expect(splitManagementFee(329_500, "legacy_owned")).toEqual({
      tolsonCents: 329_500,
      legacyKeptCents: 0,
    });
    const summary = buildManagementCards({
      expenseMonth: "2026-10",
      fees: [
        { feeCents: 100_000, truckClass: "legacy_owned" },
        { feeCents: 150_000, truckClass: "third_party" },
      ],
      operatingExpenses: [],
    });
    expect(summary.incomeCents).toBe(250_000);
    expect(summary.tolsonPayableCents).toBe(200_000);
    expect(summary.legacyKeptCents).toBe(50_000);
    expect(summary.expenseCents).toBe(0);
    expect(summary.netCents).toBe(250_000);
  });
});
